const cron = require('node-cron');
const pool = require('../config/db');

const cronService = {
  init: () => {
    // Run every 5 minutes — clean up expired ACCEPTED deals (unpaid)
    cron.schedule('*/5 * * * *', async () => {
      console.log('🧹 Running automated unpaid deal cleanup...');
      try {
        const expiredDeals = await pool.query(`
          UPDATE product_deals 
          SET status = 'EXPIRED' 
          WHERE status = 'ACCEPTED' AND payment_status = 'PENDING' AND expires_at < CURRENT_TIMESTAMP
          RETURNING product_id
        `);

        if (expiredDeals.rows.length > 0) {
          console.log(`⏳ Expired ${expiredDeals.rows.length} unpaid deals.`);
          const productIds = [...new Set(expiredDeals.rows.map(r => r.product_id))];
          for (const pid of productIds) {
            await pool.query(`
              UPDATE products 
              SET status = 'approved',
                  auction_end = CASE WHEN allow_auction = true AND auction_end < CURRENT_TIMESTAMP THEN CURRENT_TIMESTAMP + INTERVAL '3 days' ELSE auction_end END
              WHERE id = $1 AND status = 'under_offer'
              AND NOT EXISTS (
                SELECT 1 FROM product_deals 
                WHERE product_id = $1 AND status IN ('ACCEPTED', 'SHIPPED', 'DELIVERED')
              )
            `, [pid]);
          }
        }
      } catch (error) {
        console.error('❌ Cron unpaid deal cleanup failed:', error.message);
      }
    });

    // Run every hour — clean up expired AWAITING_QUOTE deals (seller didn't quote in 48 hours)
    cron.schedule('0 * * * *', async () => {
      console.log('🧹 Running automated awaiting_quote deal cleanup...');
      try {
        const expiredQuoteDeals = await pool.query(`
          UPDATE product_deals 
          SET status = 'EXPIRED', cancel_reason = 'Seller failed to provide a shipping quote in time.'
          WHERE status = 'ACCEPTED' AND payment_status = 'AWAITING_QUOTE' AND created_at < CURRENT_TIMESTAMP - INTERVAL '48 hours'
          RETURNING product_id
        `);

        if (expiredQuoteDeals.rows.length > 0) {
          console.log(`⏳ Expired ${expiredQuoteDeals.rows.length} deals due to missing shipping quote.`);
          const quoteProductIds = [...new Set(expiredQuoteDeals.rows.map(r => r.product_id))];
          for (const pid of quoteProductIds) {
            await pool.query(`
              UPDATE products 
              SET status = 'approved',
                  auction_end = CASE WHEN allow_auction = true AND auction_end < CURRENT_TIMESTAMP THEN CURRENT_TIMESTAMP + INTERVAL '3 days' ELSE auction_end END
              WHERE id = $1 AND status = 'under_offer'
              AND NOT EXISTS (
                SELECT 1 FROM product_deals 
                WHERE product_id = $1 AND status IN ('ACCEPTED', 'SHIPPED', 'DELIVERED')
              )
            `, [pid]);
          }
        }
      } catch (error) {
        console.error('❌ Cron quote cleanup failed:', error.message);
      }
    });

    // Run every hour — auto-confirm DELIVERED deals and auto-deliver SHIPPED deals
    cron.schedule('0 * * * *', async () => {
      console.log('🚀 Running automated deal auto-confirmation and auto-delivery...');
      try {
        // 1. Auto-Delivered Logic (SHIPPED -> DELIVERED after 5 days if no action)
        const autoDelivered = await pool.query(`
          UPDATE product_deals 
          SET status = 'DELIVERED', seller_delivered_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE status = 'SHIPPED' AND shipped_at < CURRENT_TIMESTAMP - INTERVAL '5 days'
        `);
        if (autoDelivered.rowCount > 0) {
          console.log(`📦 Auto-delivered ${autoDelivered.rowCount} deals.`);
        }

        // 2. Auto-Confirm Logic (DELIVERED -> CONFIRMED after 48 hours as per new requirement)
        const result = await pool.query(`
          UPDATE product_deals 
          SET status = 'CONFIRMED', 
              buyer_confirmed_at = CURRENT_TIMESTAMP,
              payout_status = 'RELEASED',
              payout_released_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
          WHERE status = 'DELIVERED' 
            AND seller_delivered_at < CURRENT_TIMESTAMP - INTERVAL '48 hours'
            AND (has_dispute IS NULL OR has_dispute = false)
          RETURNING id, seller_id, seller_payout, product_id, total_platform_fee
        `);

        if (result.rows.length > 0) {
          console.log(`✅ Auto-confirmed ${result.rows.length} deals.`);
          for (const deal of result.rows) {
            // Log payout to ledger
            await pool.query(
              "INSERT INTO financial_ledger (deal_id, user_id, amount, type, status) VALUES ($1, $2, $3, 'PAYOUT', 'RELEASED')",
              [deal.id, deal.seller_id, deal.seller_payout]
            );
            await pool.query(
              "INSERT INTO financial_ledger (deal_id, user_id, amount, type, status) VALUES ($1, $2, $3, 'COMMISSION', 'COLLECTED')",
              [deal.id, null, deal.total_platform_fee]
            );
            // Mark product as sold
            await pool.query(
              "UPDATE products SET status = 'sold' WHERE id = $1 AND status != 'sold'",
              [deal.product_id]
            );
          }
        }
      } catch (error) {
        console.error('❌ Cron auto-confirm/deliver failed:', error.message);
      }
    });

    // Run every minute — finalize ended auctions that have bids
    cron.schedule('* * * * *', async () => {
      try {
        // Find auctions that have ended, have at least one bid, and no existing active deal
        const endedAuctions = await pool.query(`
          SELECT DISTINCT p.id as product_id
          FROM products p
          WHERE p.allow_auction = true
            AND p.status = 'approved'
            AND p.auction_end < CURRENT_TIMESTAMP
            AND EXISTS (SELECT 1 FROM bids WHERE product_id = p.id)
            AND NOT EXISTS (
              SELECT 1 FROM product_deals 
              WHERE product_id = p.id 
              AND status NOT IN ('CANCELLED', 'RETURNED', 'EXPIRED')
            )
        `);

        for (const row of endedAuctions.rows) {
          const txClient = await pool.connect();
          try {
            // Get highest bid
            const bidRes = await pool.query(
              "SELECT * FROM bids WHERE product_id = $1 ORDER BY bid_amount DESC LIMIT 1",
              [row.product_id]
            );
            if (bidRes.rows.length === 0) { txClient.release(); continue; }
            const winBid = bidRes.rows[0];

            // Get platform settings
            const settingsRes = await pool.query("SELECT key, value FROM platform_settings WHERE key IN ('seller_commission_rate','buyer_commission_rate','gst_rate','verified_seller_shipment_window','unverified_seller_shipment_window')");
            const settings = {};
            settingsRes.rows.forEach(r => settings[r.key] = r.value);
            const sellerComm = parseFloat(settings.seller_commission_rate || 5);
            const buyerComm = parseFloat(settings.buyer_commission_rate || 0);
            const gst = parseFloat(settings.gst_rate || 18);
            const window = parseInt(settings.verified_seller_shipment_window || 48);

            const productRes = await pool.query("SELECT * FROM products WHERE id = $1", [row.product_id]);
            const product = productRes.rows[0];
            
            if (product.reserve_price && parseFloat(winBid.bid_amount) < parseFloat(product.reserve_price)) {
              await pool.query("UPDATE products SET status = 'expired' WHERE id = $1", [row.product_id]);
              console.log(`⚠️ Auction expired for product ${row.product_id} - Reserve price not met`);
              txClient.release();
              continue;
            }

            const sellerRes = await pool.query("SELECT * FROM users WHERE id = $1", [product.seller_id]);
            const seller = sellerRes.rows[0];

            const price = parseFloat(winBid.bid_amount);
            const shippingFee = product.shipping_type === 'fixed' ? parseFloat(product.shipping_fee || 0) : 0;

            // Use shared calculator — single source of truth for payout math
            const { sellerCommAmt, buyerCommAmt, platformGst, totalFee, tcsRate, tcsAmt, sellerPayout } =
              require('../utils/commissionCalculator').calculateDealFinancials({
                price,
                shippingFee,
                sellerCommRate: sellerComm,
                buyerCommRate: buyerComm,
                gstRate: gst,
                hasGst: !!seller?.gst_number,
              });

            // 24 hours to pay for auction winners
            const expiresAt = new Date(Date.now() + 24 * 3600000);

            // ─── ATOMIC TRANSACTION ──────────────────────────────────────────────
            await txClient.query('BEGIN');

            await txClient.query(
              `INSERT INTO product_deals (
                product_id, buyer_id, seller_id, amount, shipping_fee, shipping_type, status, expires_at,
                commission_rate, commission_amount, platform_gst_amount, total_platform_fee,
                seller_payout, seller_gst_applicable, seller_gst_number, payment_status, tcs_rate, tcs_amount,
                buyer_commission_rate, buyer_commission_amount, seller_commission_rate, seller_commission_amount
              ) VALUES ($1,$2,$3,$4,$5,$6,'ACCEPTED',$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
              [
                row.product_id, winBid.user_id, product.seller_id, price, shippingFee, product.shipping_type, expiresAt,
                sellerComm, sellerCommAmt, platformGst, totalFee, sellerPayout,
                seller?.seller_type === 'business_seller', seller?.gst_number,
                product.shipping_type === 'custom' ? 'AWAITING_QUOTE' : 'PENDING', tcsRate, tcsAmt,
                buyerComm, buyerCommAmt, sellerComm, sellerCommAmt
              ]
            );

            await txClient.query("UPDATE products SET status = 'under_offer' WHERE id = $1", [row.product_id]);

            await txClient.query('COMMIT');
            console.log(`🏆 Auction winner deal created for product ${row.product_id}`);
          } catch (err) {
            await txClient.query('ROLLBACK');
            console.error(`❌ Auction finalization failed for product ${row.product_id}:`, err.message);
          } finally {
            txClient.release();
          }
        }
      } catch (error) {
        console.error('❌ Auction winner cron failed:', error.message);
      }
    });

    // Run every 24 hours — expire auctions with no bids
    cron.schedule('0 0 * * *', async () => {
        console.log('🧹 Cleaning up expired empty auctions...');
        try {
            await pool.query(`
                UPDATE products 
                SET status = 'expired' 
                WHERE status = 'approved' 
                  AND allow_auction = true 
                  AND auction_end < CURRENT_TIMESTAMP
                  AND id NOT IN (SELECT product_id FROM bids)
            `);
        } catch (error) {
            console.error('❌ Cron cleanup failed:', error.message);
        }
    });

    console.log('📅 Cron Services Initialized.');
  }
};

module.exports = cronService;
