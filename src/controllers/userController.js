const pool = require("../config/db");

// Get comprehensive user profile
exports.getUserProfile = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      "SELECT id, name, email, phone, bio, profile_image, is_verified, seller_badge, rating, total_sold, total_bought, preferences, joined_date FROM users WHERE id = $1",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Update user profile details
exports.updateUserProfile = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, bio, shipping_address, preferences, payment_methods } = req.body;

    const result = await pool.query(
      `UPDATE users 
       SET name = COALESCE($1, name), 
           phone = COALESCE($2, phone), 
           bio = COALESCE($3, bio), 
           preferences = COALESCE($4, preferences),
           payment_methods = COALESCE($5, payment_methods)
       WHERE id = $6
       RETURNING id, name, email, phone, bio, profile_image, preferences, payment_methods`,
      [
        name, 
        phone, 
        bio, 
        preferences ? JSON.stringify(preferences) : null, 
        payment_methods ? JSON.stringify(payment_methods) : null,
        id
      ]
    );

    res.json({
      message: "Profile updated successfully",
      user: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get User Activity (DETAILED for Profile Hub)
exports.getUserActivity = async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch Buy Orders (Acquisitions)
    const buyOrders = await pool.query(
      `SELECT o.*, p.title, p.image as product_thumbnail, p.images as product_images, u.name as seller_name, 
       (SELECT id FROM reviews WHERE order_id = o.id AND user_id = $1 LIMIT 1) as review_id
       FROM orders o 
       JOIN products p ON o.product_id = p.id 
       JOIN users u ON o.seller_id = u.id 
       WHERE o.buyer_id = $1 ORDER BY o.created_at DESC`, [id]
    );

    // Fetch Sell Orders (Delivered/Sold)
    const sellOrders = await pool.query(
      `SELECT o.*, p.title, p.image as product_thumbnail, p.images as product_images, u.name as buyer_name 
       FROM orders o 
       JOIN products p ON o.product_id = p.id 
       JOIN users u ON o.buyer_id = u.id 
       WHERE o.seller_id = $1 ORDER BY o.created_at DESC`, [id]
    );

    // Fetch Chatted Products (Interested/Inquiries)
    const chattedProducts = await pool.query(
      `SELECT DISTINCT p.*, u.name as seller_name, c.id as chat_id
       FROM chats c
       JOIN products p ON c.product_id = p.id
       JOIN users u ON c.seller_id = u.id
       WHERE c.buyer_id = $1 
       AND p.id NOT IN (SELECT product_id FROM orders WHERE buyer_id = $1)
       ORDER BY p.created_at DESC`, [id]
    );

    // Fetch Listings (Active/Draft)
    const listings = await pool.query(
      "SELECT * FROM products WHERE seller_id = $1 ORDER BY created_at DESC", [id]
    );

    const parseJSONFields = (rows) => rows.map(row => {
      const fields = ['images', 'product_images', 'item_specifics', 'condition_details', 'shipping_info', 'payment_info'];
      fields.forEach(field => {
        if (row[field] && typeof row[field] === 'string') {
          try { row[field] = JSON.parse(row[field]); } catch (e) { row[field] = (field === 'images' || field === 'product_images') ? [] : {}; }
        }
      });
      return row;
    });

    res.json({
      buyOrders: parseJSONFields(buyOrders.rows),
      sellOrders: parseJSONFields(sellOrders.rows),
      listings: parseJSONFields(listings.rows),
      chattedProducts: parseJSONFields(chattedProducts.rows)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Vault Management
exports.getWatchVault = async (req, res) => {
  try {
    const { user_id } = req.params;
    const result = await pool.query(
      "SELECT * FROM watch_vault WHERE user_id = $1 ORDER BY created_at DESC",
      [user_id]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.addToVault = async (req, res) => {
  try {
    const { user_id, watch_name, brand, year, image_url } = req.body;
    const result = await pool.query(
      "INSERT INTO watch_vault (user_id, watch_name, brand, year, image_url) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [user_id, watch_name, brand, year, image_url]
    );
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.acceptTerms = async (req, res) => {
  try {
    const { id } = req.user; // From auth middleware
    await pool.query(
      "UPDATE users SET terms_accepted = TRUE WHERE id = $1",
      [id]
    );
    res.json({ message: "Terms accepted successfully", terms_accepted: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
