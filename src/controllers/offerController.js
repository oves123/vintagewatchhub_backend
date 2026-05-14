const pool = require("../config/db");

// Create a new offer
exports.createOffer = async (req, res) => {
  try {
    const { product_id, buyer_id, seller_id, amount, message } = req.body;

    // 1. Check if product allows offers
    const productCheck = await pool.query(
      "SELECT allow_offers, status, shipping_scope FROM products WHERE id = $1",
      [product_id]
    );

    if (productCheck.rows.length === 0) {
      return res.status(404).json({ message: "Product not found" });
    }

    const product = productCheck.rows[0];
    if (!product.allow_offers) {
       return res.status(400).json({ message: "This product does not accept offers" });
    }

    // 1.5 Check Geographic Restrictions
    const buyerRes = await pool.query("SELECT state FROM users WHERE id = $1", [buyer_id]);
    const buyer = buyerRes.rows[0];

    const sellerRes = await pool.query("SELECT state FROM users WHERE id = $1", [seller_id]);
    const seller = sellerRes.rows[0];

    if (product.shipping_scope === 'LOCAL' && (!buyer || !seller || buyer.state !== seller.state)) {
      let scopeMsg;
      if (!seller || !seller.state) {
        scopeMsg = "This seller has not completed their profile (state is missing). They cannot accept offers until their profile is complete.";
      } else if (!buyer || !buyer.state) {
        scopeMsg = "Please complete your profile by adding your state before making an offer.";
      } else {
        scopeMsg = `Shipping Restricted: This seller only ships within ${seller.state}. You are in ${buyer.state}. Only buyers in ${seller.state} can make offers on this item.`;
      }
      return res.status(403).json({ message: scopeMsg });
    }

    // 2. Check offer limit (5 per product/buyer)
    const limitCheck = await pool.query(
      "SELECT COUNT(*) FROM product_offers WHERE product_id = $1 AND buyer_id = $2",
      [product_id, buyer_id]
    );

    if (parseInt(limitCheck.rows[0].count) >= 5) {
      return res.status(400).json({ message: "You have reached the limit of 5 offers for this item." });
    }

    // 3. Create offer with expiry from settings
    const settingsRes = await pool.query("SELECT key, value FROM platform_settings WHERE key = 'offer_expiry_hours'");
    const offerExpiryHours = parseInt(settingsRes.rows[0]?.value || 48);

    const newOfferCount = parseInt(limitCheck.rows[0].count) + 1;
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + offerExpiryHours);
    
    const result = await pool.query(
      `INSERT INTO product_offers (product_id, buyer_id, seller_id, amount, status, message, offer_count, expires_at)
       VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7)
       RETURNING *`,
      [product_id, buyer_id, seller_id, amount, message, newOfferCount, expiresAt]
    );

    res.json({
      message: "Offer submitted successfully",
      offer: result.rows[0],
      remaining: 5 - newOfferCount
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Respond to an offer
exports.respondToOffer = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { id } = req.params;
    const { status, counter_amount } = req.body; // status: 'accepted', 'declined', 'countered', 'rejected'

    // 1. Get current offer state with lock
    const currentRes = await client.query("SELECT * FROM product_offers WHERE id = $1 FOR UPDATE", [id]);
    if (currentRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: "Offer not found" });
    }
    const oldOffer = currentRes.rows[0];

    if (oldOffer.status !== 'pending' && oldOffer.status !== 'countered' && oldOffer.status !== 'buyer_countered') {
       await client.query('ROLLBACK');
       return res.status(400).json({ message: `Offer is already ${oldOffer.status}` });
    }

    // 2. Update offer status
    const result = await client.query(
      `UPDATE product_offers 
       SET status = $1, counter_amount = $2
       WHERE id = $3 
       RETURNING *`,
      [status, status === 'countered' ? counter_amount : oldOffer.counter_amount, id]
    );

    const offer = result.rows[0];

    // If accepted, create a DEAL (state machine)
    if (status === 'accepted') {
        // 1. Lock product for update
        const productRes = await client.query("SELECT * FROM products WHERE id = $1 FOR UPDATE", [offer.product_id]);
        const product = productRes.rows[0];

        if (product.status !== 'approved') {
          await client.query('ROLLBACK');
          return res.status(400).json({ message: "Product is no longer available" });
        }

        // 2. Auto-reject all other pending offers for this product
        await client.query(
          "UPDATE product_offers SET status = 'rejected' WHERE product_id = $1 AND id != $2 AND status = 'pending'",
          [offer.product_id, offer.id]
        );

        // 3. Fetch platform settings and seller details for calculations
        const settingsRes = await client.query("SELECT key, value FROM platform_settings WHERE key IN ('seller_commission_rate', 'buyer_commission_rate', 'gst_rate', 'verified_seller_shipment_window', 'unverified_seller_shipment_window')");
        const settings = {};
        settingsRes.rows.forEach(r => settings[r.key] = r.value);
        
        const sellerCommissionRate = parseFloat(settings.seller_commission_rate || 5);
        const buyerCommissionRate = parseFloat(settings.buyer_commission_rate || 0);
        const gstRate = parseFloat(settings.gst_rate || 18);
        const verifiedWindow = parseInt(settings.verified_seller_shipment_window || 48);
        const unverifiedWindow = parseInt(settings.unverified_seller_shipment_window || 72);

        const sellerRes = await client.query("SELECT seller_type, gst_number, is_verified FROM users WHERE id = $1", [offer.seller_id]);
        const seller = sellerRes.rows[0];

        // 4. Set expiry (SHIPMENT WINDOW)
        const isVerified = seller && seller.is_verified;
        const hoursToAdd = isVerified ? verifiedWindow : unverifiedWindow;
        
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + hoursToAdd);

        // Use counter_amount if it was a counter-offer being accepted, otherwise use original amount
        const finalAmount = parseFloat(oldOffer.status === 'countered' ? oldOffer.counter_amount : offer.amount);
        const shippingFee = (product.shipping_type === 'fixed') ? parseFloat(product.shipping_fee || 0) : 0;

        // 5. Calculations
        const seller_commission_amount = finalAmount * (sellerCommissionRate / 100);
        const buyer_commission_amount = finalAmount * (buyerCommissionRate / 100);
        const platform_gst_amount = (seller_commission_amount + buyer_commission_amount) * (gstRate / 100);
        const total_platform_fee = seller_commission_amount + buyer_commission_amount + platform_gst_amount;
        
        let tcs_rate = 0;
        let tcs_amount = 0;
        if (seller.gst_number) {
            tcs_rate = 1.00; // 1%
            tcs_amount = finalAmount * 0.01;
        }

        const seller_payout = (finalAmount - seller_commission_amount - (seller_commission_amount * (gstRate / 100)) - tcs_amount) + shippingFee;
        const seller_gst_applicable = seller.seller_type === 'business_seller';
        const seller_gst_number = seller.gst_number;

        await client.query(
          `INSERT INTO product_deals (
            product_id, buyer_id, seller_id, offer_id, amount, shipping_fee, shipping_type, status, expires_at,
            commission_rate, commission_amount, platform_gst_amount, total_platform_fee,
            seller_payout, seller_gst_applicable, seller_gst_number, payment_status, tcs_rate, tcs_amount,
            buyer_commission_rate, buyer_commission_amount, seller_commission_rate, seller_commission_amount
          )
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACCEPTED', $8, $9, $10, $11, $12, $13, $14, $15, 'PENDING', $16, $17, $18, $19, $20, $21)`,
          [
            offer.product_id, offer.buyer_id, offer.seller_id, offer.id, finalAmount, shippingFee, product.shipping_type, expiresAt,
            sellerCommissionRate, seller_commission_amount, platform_gst_amount, total_platform_fee,
            seller_payout, seller_gst_applicable, seller_gst_number, tcs_rate, tcs_amount,
            buyerCommissionRate, buyer_commission_amount, sellerCommissionRate, seller_commission_amount
          ]
        );

        // 6. Update product status to 'under_offer' immediately to lock it
        await client.query(
          "UPDATE products SET status = 'under_offer' WHERE id = $1",
          [offer.product_id]
        );

        // 7. Send System Message to Chat 
        const chatRes = await client.query(
          "SELECT id FROM chats WHERE product_id = $1 AND buyer_id = $2 AND seller_id = $3",
          [offer.product_id, offer.buyer_id, offer.seller_id]
        );

        if (chatRes.rows.length > 0) {
          const chatId = chatRes.rows[0].id;
          const systemMsg = await client.query(
            "INSERT INTO messages (chat_id, sender_id, message, type, metadata) VALUES ($1, $2, $3, $4, $5) RETURNING *",
            [chatId, offer.seller_id, "Offer Accepted! Please go to your Profile to complete the payment.", "system_deal", JSON.stringify({ offer_id: offer.id, status: 'accepted' })]
          );

          const io = req.app.get("io");
          if (io) {
            io.to(`chat_${chatId}`).emit("newMessage", systemMsg.rows[0]);
          }
        }
    }

    await client.query('COMMIT');
    res.json({
      message: `Offer ${status} successfully`,
      offer: offer
    });

  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
};

// Get offers for a specific product (Seller view)
exports.getOffersForProduct = async (req, res) => {
  try {
    const { product_id } = req.params;
    const result = await pool.query(
      `SELECT o.*, u.name as buyer_name 
       FROM product_offers o
       JOIN users u ON o.buyer_id = u.id
       WHERE o.product_id = $1
       ORDER BY o.created_at DESC`,
      [product_id]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get user's negotiations (Buyer/Seller view for profile)
exports.getUserOffers = async (req, res) => {
  try {
    const { user_id } = req.params;

    // 1. First: Run expiry check for any 'ACCEPTED' deals older than shipment window
    await pool.query(`
      UPDATE product_deals 
      SET status = 'EXPIRED' 
      WHERE status = 'ACCEPTED' AND expires_at < CURRENT_TIMESTAMP
    `);

    // 2. Second: Run expiry check for any 'pending' or 'countered' OFFERS older than 48h
    await pool.query(`
      UPDATE product_offers 
      SET status = 'rejected' 
      WHERE (status = 'pending' OR status = 'countered') AND expires_at < CURRENT_TIMESTAMP
    `);

    // 3. Reset products back to 'approved' ONLY if no other active deal exists.
    const expiredDeals = await pool.query(`
      SELECT DISTINCT product_id FROM product_deals 
      WHERE status = 'EXPIRED' AND updated_at > (CURRENT_TIMESTAMP - INTERVAL '1 hour')
    `);
    
    if (expiredDeals.rows.length > 0) {
      const productIds = [...new Set(expiredDeals.rows.map(r => r.product_id))];
      for (const pid of productIds) {
        await pool.query(`
          UPDATE products 
          SET status = 'approved' 
          WHERE id = $1
          AND NOT EXISTS (
            SELECT 1 FROM product_deals 
            WHERE product_id = $1 AND status IN ('ACCEPTED', 'SHIPPED', 'DELIVERED')
          )
        `, [pid]);
      }
    }

    // Get offers where user is either buyer or seller
    const result = await pool.query(
      `SELECT o.*, p.title, p.images, p.price as listed_price, 
              u_buyer.name as buyer_name, u_seller.name as seller_name,
             CASE WHEN o.buyer_id = $1 THEN u_seller.name ELSE u_buyer.name END as counterparty_name,
             (SELECT id FROM chats WHERE product_id = o.product_id AND buyer_id = o.buyer_id AND seller_id = o.seller_id LIMIT 1) as chat_id,
             d.status as deal_status, d.id as deal_id, d.expires_at
      FROM product_offers o
      JOIN products p ON o.product_id = p.id
      JOIN users u_buyer ON o.buyer_id = u_buyer.id
      JOIN users u_seller ON o.seller_id = u_seller.id
      LEFT JOIN product_deals d ON o.id = d.offer_id
      WHERE o.buyer_id = $1 OR o.seller_id = $1
      ORDER BY o.created_at DESC`,
     [user_id]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
