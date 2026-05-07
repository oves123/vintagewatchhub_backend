const pool = require("../config/db");

// Get comprehensive user profile
exports.getUserProfile = async (req, res) => {
  try {
    const { id } = req.params;
    const requesterId = req.user.id;
    const requesterRole = req.user.role;

    // Only allow self or admin
    if (parseInt(id) !== parseInt(requesterId) && requesterRole !== 'admin') {
      return res.status(403).json({ message: "Access denied. You can only view your own profile." });
    }

    const result = await pool.query(
      "SELECT id, name, email, phone, bio, profile_image, address, city, state, pincode, is_verified, seller_badge, rating, total_sold, total_bought, preferences, joined_date, seller_type, gst_number, pan_number, gst_enrolment_id FROM users WHERE id = $1",
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
    const requesterId = req.user.id;
    const requesterRole = req.user.role;

    // Only allow self or admin
    if (parseInt(id) !== parseInt(requesterId) && requesterRole !== 'admin') {
      return res.status(403).json({ message: "Access denied. You can only update your own profile." });
    }

    const { name, phone, bio, preferences, payment_methods, address, city, state, pincode, pan_number, gst_enrolment_id, gst_number } = req.body;

    const result = await pool.query(
      `UPDATE users 
       SET name = COALESCE($1, name), 
           phone = COALESCE($2, phone), 
           bio = COALESCE($3, bio), 
           preferences = COALESCE($4, preferences),
           payment_methods = COALESCE($5, payment_methods),
           address = COALESCE($6, address),
           city = COALESCE($7, city),
           state = COALESCE($8, state),
           pincode = COALESCE($9, pincode),
           pan_number = COALESCE($10, pan_number),
           gst_enrolment_id = COALESCE($11, gst_enrolment_id),
           gst_number = COALESCE($12, gst_number)
       WHERE id = $13
       RETURNING id, name, email, phone, bio, profile_image, preferences, payment_methods, address, city, state, pincode, pan_number, gst_enrolment_id, gst_number`,
      [
        name, 
        phone, 
        bio, 
        preferences ? JSON.stringify(preferences) : null, 
        payment_methods ? JSON.stringify(payment_methods) : null,
        address,
        city,
        state,
        pincode,
        pan_number,
        gst_enrolment_id,
        gst_number,
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
    const requesterId = req.user.id;
    const requesterRole = req.user.role;

    // Only allow self or admin
    if (parseInt(id) !== parseInt(requesterId) && requesterRole !== 'admin') {
      return res.status(403).json({ message: "Access denied." });
    }

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
    const requesterId = req.user.id;

    if (parseInt(user_id) !== parseInt(requesterId)) {
      return res.status(403).json({ message: "Access denied." });
    }
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

// Get User Financial Reports (Aggregated by month/year)
exports.getMyFinancialReports = async (req, res) => {
  const { id } = req.params;
  const requesterId = req.user.id;

  if (parseInt(id) !== parseInt(requesterId)) {
    return res.status(403).json({ message: "Access denied." });
  }
  const { year } = req.query;
  const targetYear = year || new Date().getFullYear();

  try {
    // 1. Monthly Aggregates for the selected year
    const monthlyStats = await pool.query(`
      SELECT 
        EXTRACT(MONTH FROM created_at) as month,
        SUM(CASE WHEN seller_id = $1 THEN amount ELSE 0 END) as sales_volume,
        SUM(CASE WHEN buyer_id = $1 THEN amount ELSE 0 END) as purchase_volume,
        COUNT(CASE WHEN seller_id = $1 THEN 1 END) as items_sold,
        COUNT(CASE WHEN buyer_id = $1 THEN 1 END) as items_bought
      FROM product_deals
      WHERE (seller_id = $1 OR buyer_id = $1)
        AND status = 'CONFIRMED'
        AND EXTRACT(YEAR FROM created_at) = $2
      GROUP BY month
      ORDER BY month ASC
    `, [id, targetYear]);

    // 2. Lifetime Totals
    const lifetimeStats = await pool.query(`
       SELECT 
         SUM(CASE WHEN seller_id = $1 THEN amount ELSE 0 END) as total_sales,
         SUM(CASE WHEN buyer_id = $1 THEN amount ELSE 0 END) as total_spent,
         COUNT(CASE WHEN seller_id = $1 THEN 1 END) as total_items_sold,
         COUNT(CASE WHEN buyer_id = $1 THEN 1 END) as total_items_bought
       FROM product_deals
       WHERE status = 'CONFIRMED' AND (seller_id = $1 OR buyer_id = $1)
    `, [id]);

    res.json({
      year: targetYear,
      monthly: monthlyStats.rows,
      totals: lifetimeStats.rows[0] || { total_sales: 0, total_spent: 0, total_items_sold: 0, total_items_bought: 0 }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get Detailed Financial Ledger (Individual Transactions)
exports.getMyFinancialLedger = async (req, res) => {
  const { id } = req.params;
  const requesterId = req.user.id;

  if (parseInt(id) !== parseInt(requesterId)) {
    return res.status(403).json({ message: "Access denied." });
  }
  const { year, month, status, role, search, startDate, endDate } = req.query;
  
  try {
    let query = `
      SELECT 
        d.*, 
        p.title as product_title, 
        p.image as product_image,
        b.name as buyer_name,
        s.name as seller_name,
        (d.amount + d.shipping_fee + d.buyer_commission_amount + (d.buyer_commission_amount * 0.18)) as total_buyer_cost
      FROM product_deals d
      JOIN products p ON d.product_id = p.id
      JOIN users b ON d.buyer_id = b.id
      JOIN users s ON d.seller_id = s.id
      WHERE (d.seller_id = $1 OR d.buyer_id = $1)
    `;
    
    const params = [id];
    let paramCount = 1;

    if (startDate) {
      paramCount++;
      query += ` AND d.created_at >= $${paramCount}`;
      params.push(startDate);
    }
    if (endDate) {
      paramCount++;
      query += ` AND d.created_at <= $${paramCount}`;
      params.push(endDate + ' 23:59:59'); // Include the full end day
    }
    if (year && !startDate && !endDate) {
      paramCount++;
      query += ` AND EXTRACT(YEAR FROM d.created_at) = $${paramCount}`;
      params.push(year);
    }
    if (month && !startDate && !endDate) {
      paramCount++;
      query += ` AND EXTRACT(MONTH FROM d.created_at) = $${paramCount}`;
      params.push(month);
    }
    if (status && status !== 'ALL') {
      paramCount++;
      query += ` AND d.status = $${paramCount}`;
      params.push(status);
    }
    if (role === 'buyer') {
      query += ` AND d.buyer_id = $1`;
    } else if (role === 'seller') {
      query += ` AND d.seller_id = $1`;
    }
    if (search) {
      paramCount++;
      query += ` AND p.title ILIKE $${paramCount}`;
      params.push(`%${search}%`);
    }

    query += ` ORDER BY d.created_at DESC`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
