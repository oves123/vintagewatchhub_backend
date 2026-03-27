const pool = require("../config/db");

// Create a new offer
exports.createOffer = async (req, res) => {
  try {
    const { product_id, buyer_id, seller_id, amount, message } = req.body;

    // 1. Check if product allows offers
    const productCheck = await pool.query(
      "SELECT allow_offers, status FROM products WHERE id = $1",
      [product_id]
    );

    if (productCheck.rows.length === 0) {
      return res.status(404).json({ message: "Product not found" });
    }

    if (!productCheck.rows[0].allow_offers) {
      return res.status(400).json({ message: "This product does not accept offers" });
    }

    // 2. Check offer limit (5 per product/buyer)
    const limitCheck = await pool.query(
      "SELECT COUNT(*) FROM product_offers WHERE product_id = $1 AND buyer_id = $2",
      [product_id, buyer_id]
    );

    if (parseInt(limitCheck.rows[0].count) >= 5) {
      return res.status(400).json({ message: "You have reached the limit of 5 offers for this item" });
    }

    // 3. Create offer with 48h expiry
    const newOfferCount = parseInt(limitCheck.rows[0].count) + 1;
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 48);
    
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
  try {
    const { id } = req.params;
    const { status, counter_amount } = req.body; // status: 'accepted', 'declined', 'countered', 'rejected'

    // Update offer status
    const result = await pool.query(
      `UPDATE product_offers 
       SET status = $1, counter_amount = $2
       WHERE id = $3 
       RETURNING *`,
      [status, counter_amount || null, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Offer not found" });
    }

    const offer = result.rows[0];

    // If accepted, create a DEAL (state machine)
    if (status === 'accepted') {
      try {
        // 1. Auto-reject all other pending offers for this product
        await pool.query(
          "UPDATE product_offers SET status = 'rejected' WHERE product_id = $1 AND id != $2 AND status = 'pending'",
          [offer.product_id, offer.id]
        );

        // 2. Set expiry (SHIPMENT WINDOW)
        // Default: 72h, Verified: 48h
        const userCheck = await pool.query("SELECT is_verified FROM users WHERE id = $1", [offer.seller_id]);
        const isVerified = userCheck.rows.length > 0 && userCheck.rows[0].is_verified;
        const hoursToAdd = isVerified ? 48 : 72;
        
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + hoursToAdd);

        await pool.query(
          `INSERT INTO product_deals (product_id, buyer_id, seller_id, offer_id, amount, status, expires_at)
           VALUES ($1, $2, $3, $4, $5, 'ACCEPTED', $6)`,
          [offer.product_id, offer.buyer_id, offer.seller_id, offer.id, offer.amount, expiresAt]
        );

        // 3. Update product status to 'under_offer' immediately to lock it (but still visible in search as per new requirement)
        await pool.query(
          "UPDATE products SET status = 'under_offer' WHERE id = $1",
          [offer.product_id]
        );
      } catch (dealErr) {
        console.error("Deal creation failed on offer acceptance:", dealErr);
      }
    }

    res.json({
      message: `Offer ${status} successfully`,
      offer: offer
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
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
