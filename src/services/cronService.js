const cron = require('node-cron');
const pool = require('../config/db');

const cronService = {
  init: () => {
    // Run every hour
    cron.schedule('0 * * * *', async () => {
      console.log('🚀 Running automated deal auto-confirmation...');
      try {
        // Find deals in DELIVERED state that have passed their auto_payout_at time
        const result = await pool.query(`
          UPDATE product_deals 
          SET status = 'CONFIRMED', 
              payout_status = 'RELEASED',
              payout_released_at = CURRENT_TIMESTAMP
          WHERE status = 'DELIVERED' 
            AND auto_payout_at <= CURRENT_TIMESTAMP
          RETURNING id, seller_id, seller_payout
        `);

        if (result.rows.length > 0) {
          console.log(`✅ Auto-confirmed ${result.rows.length} deals.`);
          
          // Log to financial ledger
          for (const deal of result.rows) {
            await pool.query(
              "INSERT INTO financial_ledger (deal_id, user_id, amount, type, status) VALUES ($1, $2, $3, 'PAYOUT', 'RELEASED')",
              [deal.id, deal.seller_id, deal.seller_payout]
            );
          }
        }
      } catch (error) {
        console.error('❌ Cron auto-confirm failed:', error.message);
      }
    });

    // Run every 24 hours to clear expired auctions with no bids
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
