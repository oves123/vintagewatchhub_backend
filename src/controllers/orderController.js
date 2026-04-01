const pool = require("../config/db");
const notificationService = require("../services/notificationService");

exports.createAuctionWinnerOrder = async (req, res) => {

  try {

    const { product_id } = req.body;

    // get highest bid
    const bidResult = await pool.query(
      `SELECT * FROM bids
    WHERE product_id=$1
    ORDER BY bid_amount DESC
    LIMIT 1`,
      [product_id]
    );

    if (bidResult.rows.length === 0) {
      return res.status(400).json({ message: "No bids found" });
    }

    const highestBid = bidResult.rows[0];

    // get product
    const productResult = await pool.query(
      `SELECT * FROM products WHERE id=$1`,
      [product_id]
    );

    const product = productResult.rows[0];

    const order = await pool.query(
      `INSERT INTO orders(product_id,buyer_id,seller_id,price)
    VALUES($1,$2,$3,$4)
    RETURNING *`,
      [
        product_id,
        highestBid.user_id,
        product.seller_id,
        highestBid.bid_amount
      ]
    );

    res.json({
      message: "Auction winner order created",
      order: order.rows[0]
    });

  } catch (error) {

    res.status(500).json({ error: error.message });

  }

};
exports.getBuyerOrders = async (req, res) => {

  try {

    const { user_id } = req.params;

    const result = await pool.query(
      `SELECT orders.*, products.title
    FROM orders
    LEFT JOIN products
    ON orders.product_id = products.id
    WHERE buyer_id=$1`,
      [user_id]
    );

    res.json(result.rows);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }

};

exports.createOrder = async (req, res) => {
  try {
    const { product_id, buyer_id, seller_id, amount } = req.body;

    const result = await pool.query(
      `INSERT INTO orders (product_id, buyer_id, seller_id, price, status, payment_status)
       VALUES ($1, $2, $3, $4, 'processing', 'Paid')
       RETURNING *`,
      [product_id, buyer_id, seller_id, amount]
    );

    // Update product status to sold
    await pool.query(
      "UPDATE products SET status = 'sold' WHERE id = $1",
      [product_id]
    );

    res.json({
      message: "Order created successfully",
      order: result.rows[0]
    });

    // Notify Seller
    try {
      const productRes = await pool.query("SELECT title FROM products WHERE id = $1", [product_id]);
      await notificationService.createNotification({
        user_id: seller_id,
        title: "New Order Received! 🕰️",
        message: `You have a new order for "${productRes.rows[0]?.title || 'Watch'}". Please ship it within 48 hours.`,
        type: 'success',
        link: '/profile?tab=selling'
      });
    } catch (err) { console.error("Order notification failed:", err.message); }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
exports.getSellerOrders = async (req, res) => {
  // ... existing code (deprecated)
};

exports.getUserDeals = async (req, res) => {
  try {
    const { user_id } = req.params;

    // 1. Lazy Expiry Cleanup (Failed to ship in 48h)
    const expiredDeals = await pool.query(`
      UPDATE product_deals 
      SET status = 'EXPIRED' 
      WHERE status = 'ACCEPTED' AND expires_at < CURRENT_TIMESTAMP
      RETURNING product_id
    `);

    if (expiredDeals.rows.length > 0) {
      const productIds = [...new Set(expiredDeals.rows.map(r => r.product_id))];
      for (const pid of productIds) {
        await pool.query(`
          UPDATE products 
          SET status = 'approved' 
          WHERE id = $1 AND status = 'under_offer'
          AND NOT EXISTS (
            SELECT 1 FROM product_deals 
            WHERE product_id = $1 AND status IN ('ACCEPTED', 'SHIPPED', 'DELIVERED')
          )
        `, [pid]);
      }
    }

    // 2. Auto-Delivered Logic (SHIPPED -> DELIVERED after 5 days if no action)
    await pool.query(`
      UPDATE product_deals 
      SET status = 'DELIVERED', seller_delivered_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE status = 'SHIPPED' AND shipped_at < CURRENT_TIMESTAMP - INTERVAL '5 days'
    `);

    // 3. Auto-Confirm Logic (DELIVERED -> CONFIRMED after 7 days as per new requirement)
    await pool.query(`
      UPDATE product_deals 
      SET status = 'CONFIRMED', buyer_confirmed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE status = 'DELIVERED' AND seller_delivered_at < CURRENT_TIMESTAMP - INTERVAL '7 days'
    `);

    const result = await pool.query(
      `SELECT d.*, p.title, p.images, 
              u_buyer.name as buyer_name, u_seller.name as seller_name,
              u_seller.payment_methods as seller_payment_info
       FROM product_deals d
       JOIN products p ON d.product_id = p.id
       JOIN users u_buyer ON d.buyer_id = u_buyer.id
       JOIN users u_seller ON d.seller_id = u_seller.id
       WHERE d.buyer_id = $1 OR d.seller_id = $1
       ORDER BY d.created_at DESC`,
      [user_id]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Buyer marks deal as PAID
exports.markDealAsPaid = async (req, res) => {
  try {
    const { id } = req.params;
    const { buyer_id, payment_method } = req.body;

    const result = await pool.query(
      "UPDATE product_deals SET payment_status = 'PAID', payment_method = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND buyer_id = $3 AND payment_status = 'PENDING' RETURNING *",
      [payment_method, id, buyer_id]
    );

    if (result.rows.length === 0) return res.status(403).json({ message: 'Unauthorized or deal already paid' });

    // Notify Seller
    try {
      const deal = result.rows[0];
      const productRes = await pool.query("SELECT title FROM products WHERE id = $1", [deal.product_id]);
      await notificationService.createNotification({
        user_id: deal.seller_id,
        title: "Payment Received! 💸",
        message: `The buyer has marked the deal for "${productRes.rows[0]?.title || 'Watch'}" as PAID via ${payment_method}. Please verify and ship.`,
        type: 'success',
        link: '/profile?tab=selling'
      });
    } catch (err) { console.error("Paid notification failed:", err.message); }

    res.json({ message: 'Deal marked as PAID. Seller has been notified.', deal: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Seller marks deal as SHIPPED
exports.markShipped = async (req, res) => {
  try {
    const { id } = req.params; 
    const { seller_id, courier_name, tracking_number } = req.body;

    const dealCheck = await pool.query(
      'SELECT * FROM product_deals WHERE id = $1 AND seller_id = $2',
      [id, seller_id]
    );
    if (dealCheck.rows.length === 0) {
      return res.status(403).json({ message: 'Deal not found or not authorized' });
    }

    const deal = dealCheck.rows[0];
    
    // Validate tracking number length (min 8, max 25 chars)
    if (tracking_number && (tracking_number.length < 8 || tracking_number.length > 25)) {
      return res.status(400).json({ message: 'Invalid tracking number. Must be between 8 and 25 characters.' });
    }

    // Update deal status to 'shipped'
    await pool.query(
      `UPDATE product_deals 
       SET status = 'SHIPPED', tracking_number = $1, courier_name = $2, 
           shipped_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $3`,
      [tracking_number || null, courier_name || 'Hand Delivery', id]
    );

    // Update product status to 'sold' on the marketplace (removes from search)
    await pool.query(
      "UPDATE products SET status = 'sold' WHERE id = $1",
      [deal.product_id]
    );

    res.json({ message: 'Item marked as shipped. Buyer has been notified.' });

    // Notify Buyer
    try {
      const productRes = await pool.query("SELECT title FROM products WHERE id = $1", [deal.product_id]);
      await notificationService.createNotification({
        user_id: deal.buyer_id,
        title: "Item Shipped! 📦",
        message: `Your item "${productRes.rows[0]?.title || 'Watch'}" is on its way. Tracking: ${tracking_number || 'N/A'}`,
        type: 'info',
        link: '/profile?tab=buying'
      });
    } catch (err) { console.error("Ship notification failed:", err.message); }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Seller marks deal as DELIVERED (proof of delivery)
exports.markDelivered = async (req, res) => {
  try {
    const { id } = req.params;
    const { seller_id } = req.body;

    const result = await pool.query(
      "UPDATE product_deals SET status = 'DELIVERED', seller_delivered_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND seller_id = $2 AND status = 'SHIPPED' RETURNING *",
      [id, seller_id]
    );

    if (result.rows.length === 0) return res.status(403).json({ message: 'Unauthorized or deal not in SHIPPED state (Check for DISPUTE)' });
    
    // Notify Buyer
    try {
      const deal = result.rows[0];
      const productRes = await pool.query("SELECT title FROM products WHERE id = $1", [deal.product_id]);
      await notificationService.createNotification({
        user_id: deal.buyer_id,
        title: "Item Delivered! 🏡",
        message: `Your item "${productRes.rows[0]?.title || 'Watch'}" has been marked as delivered by the seller. Please confirm receipt.`,
        type: 'info',
        link: '/profile?tab=buying'
      });
    } catch (err) { console.error("Delivered notification failed:", err.message); }

    res.json({ message: 'Item marked as delivered. Buyer has 7 days to confirm before auto-completion.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Buyer confirms receipt (Moves to DELIVERED)
exports.confirmReceived = async (req, res) => {
  try {
    const { id } = req.params;
    const { buyer_id } = req.body;

    const result = await pool.query(
      "UPDATE product_deals SET status = 'DELIVERED', seller_delivered_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND buyer_id = $2 AND status = 'SHIPPED' RETURNING *",
      [id, buyer_id]
    );

    if (result.rows.length === 0) return res.status(403).json({ message: 'Unauthorized or deal not in SHIPPED state' });
    res.json({ message: 'Receipt confirmed. Please verify the item and then confirm completion to leave a review.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Buyer confirms completion (CONFIRMED) - The final gating step
exports.confirmSale = async (req, res) => {
  try {
    const { id } = req.params; 
    const { buyer_id } = req.body;

    const result = await pool.query(
      "UPDATE product_deals SET status = 'CONFIRMED', buyer_confirmed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND buyer_id = $2 AND status = 'DELIVERED' RETURNING *",
      [id, buyer_id]
    );

    if (result.rows.length === 0) return res.status(403).json({ message: 'Unauthorized or deal not in DELIVERED state (Check for DISPUTE)' });
    
    // Finalize Product status to 'sold' (Only now is it truly sold)
    const product_id = result.rows[0].product_id;
    await pool.query("UPDATE products SET status = 'sold' WHERE id = $1", [product_id]);

    res.json({ message: 'Deal finalized! You can now leave a review for the seller.', deal: result.rows[0] });

    // Notify Seller
    try {
      const deal = result.rows[0];
      const productRes = await pool.query("SELECT title FROM products WHERE id = $1", [deal.product_id]);
      await notificationService.createNotification({
        user_id: deal.seller_id,
        title: "Sale Finalized! 💰",
        message: `The buyer has confirmed the sale for "${productRes.rows[0]?.title || 'Watch'}". Payment is being processed.`,
        type: 'success',
        link: '/profile?tab=selling'
      });
    } catch (err) { console.error("Finalize notification failed:", err.message); }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Cancel Deal
exports.cancelDeal = async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id, reason } = req.body;

    // Verify ownership and ensure it's still in ACCEPTED state and NOT SHIPPED
    const dealCheck = await pool.query(
      'SELECT * FROM product_deals WHERE id = $1 AND (seller_id = $2 OR buyer_id = $2) AND status = \'ACCEPTED\' AND shipped_at IS NULL',
      [id, user_id]
    );
    if (dealCheck.rows.length === 0) return res.status(403).json({ message: 'Cancellation blocked: Order may have already been shipped, disputed, or cancelled.' });

    const deal = dealCheck.rows[0];

    // Mark deal as cancelled
    await pool.query(
      "UPDATE product_deals SET status = 'CANCELLED', cancel_reason = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
      [reason, id]
    );

    // Reset product to approved
    await pool.query(
      "UPDATE products SET status = 'approved' WHERE id = $1",
      [deal.product_id]
    );

    res.json({ message: 'Deal cancelled successfully.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Dispute Deal
exports.disputeDeal = async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id, reason } = req.body;

    const result = await pool.query(
      "UPDATE product_deals SET status = 'DISPUTED', dispute_reason = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND (seller_id = $3 OR buyer_id = $3) RETURNING *",
      [reason, id, user_id]
    );

    if (result.rows.length === 0) return res.status(403).json({ message: 'Unauthorized' });

    // Notify other party and Admin
    try {
      const deal = result.rows[0];
      const recipientId = (user_id == deal.buyer_id) ? deal.seller_id : deal.buyer_id;
      const productRes = await pool.query("SELECT title FROM products WHERE id = $1", [deal.product_id]);
      
      await notificationService.createNotification({
        user_id: recipientId,
        title: "Dispute Raised! ⚠️",
        message: `A dispute has been raised for "${productRes.rows[0]?.title || 'Watch'}". Admin will review it.`,
        type: 'error',
        link: (user_id == deal.buyer_id) ? '/profile?tab=buying' : '/profile?tab=selling'
      });

      // Notify Admins
      const adminIds = await notificationService.getAdminIds();
      for (const adminId of adminIds) {
        await notificationService.createNotification({
          user_id: adminId,
          title: "New Transaction Dispute",
          message: `A dispute has been raised for Deal #${id}.`,
          type: 'error',
          link: '/admin?tab=orders'
        });
      }
    } catch (err) { console.error("Dispute notification failed:", err.message); }

    res.json({ message: 'Dispute raised. Admin will review the transaction.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Mark as RETURNED (Failed delivery or buyer rejection)
exports.markReturned = async (req, res) => {
  try {
    const { id } = req.params;
    const { seller_id, reason } = req.body;

    const result = await pool.query(
      "UPDATE product_deals SET status = 'RETURNED', cancel_reason = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND seller_id = $3 AND status IN ('SHIPPED', 'DELIVERED') RETURNING *",
      [reason, id, seller_id]
    );

    if (result.rows.length === 0) return res.status(403).json({ message: 'Unauthorized or deal not in SHIPPED/DELIVERED state' });
    
    // Reset product to approved as it's coming back
    await pool.query("UPDATE products SET status = 'approved' WHERE id = $1", [result.rows[0].product_id]);

    res.json({ message: 'Item marked as RETURNED. Listing has been reactivated.', deal: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};