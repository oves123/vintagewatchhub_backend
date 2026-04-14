const pool = require("../config/db");
const { logAdminAction } = require("../utils/adminLogger");
const notificationService = require("../services/notificationService");

exports.getStats = async (req, res) => {
  console.log("Fetching enhanced admin stats...");
  try {
    const userCount = await pool.query("SELECT COUNT(*) FROM users");
    const productCount = await pool.query("SELECT COUNT(*) FROM products WHERE status = 'approved'");
    const pendingProducts = await pool.query("SELECT COUNT(*) FROM products WHERE status = 'pending'");
    const watchlistCount = await pool.query("SELECT COUNT(*) FROM watchlist");
    const totalValue = await pool.query("SELECT SUM(price) FROM products WHERE status = 'approved'");
    const orderCount = await pool.query("SELECT COUNT(*) FROM orders");
    const totalTransactions = await pool.query("SELECT SUM(price) FROM orders");
    
    // Auction specific metrics
    const bidCount = await pool.query("SELECT COUNT(*) FROM bids").catch(() => ({ rows: [{ count: 0 }] }));
    const highestBid = await pool.query("SELECT MAX(bid_amount) FROM bids").catch(() => ({ rows: [{ max: 0 }] }));
    const activeAuctions = await pool.query("SELECT COUNT(*) FROM products WHERE status = 'approved' AND product_type = 'auction'");
    
    // Detailed User Metrics
    const sellerCount = await pool.query("SELECT COUNT(DISTINCT seller_id) FROM products");
    const buyerCount = await pool.query("SELECT COUNT(DISTINCT buyer_id) FROM orders").catch(() => ({ rows: [{ count: 0 }] }));
    const visitorCount = await pool.query("SELECT COUNT(*) FROM visitor_logs").catch(() => ({ rows: [{ count: 0 }] }));

    const stats = {
      totalUsers: parseInt(userCount.rows[0]?.count || 0),
      activeSellers: parseInt(sellerCount.rows[0]?.count || 0),
      totalBuyers: parseInt(buyerCount.rows[0]?.count || 0),
      liveProducts: parseInt(productCount.rows[0]?.count || 0),
      pendingVerifications: parseInt(pendingProducts.rows[0]?.count || 0),
      totalWatchlists: parseInt(watchlistCount.rows[0]?.count || 0),
      totalValue: parseFloat(totalValue.rows[0]?.sum || 0),
      totalOrders: parseInt(orderCount.rows[0]?.count || 0),
      grossTurnover: parseFloat(totalTransactions.rows[0]?.sum || 0),
      totalVisitors: parseInt(visitorCount.rows[0]?.count || 0),
      totalBids: parseInt(bidCount.rows[0]?.count || 0),
      highestBid: parseFloat(highestBid.rows[0]?.max || 0),
      activeAuctions: parseInt(activeAuctions.rows[0]?.count || 0)
    };

    console.log("Enhanced stats calculated:", stats);
    res.json(stats);
  } catch (error) {
    console.error("Error fetching admin stats DETAILED:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.getUsers = async (req, res) => {
  try {
    const query = `
      SELECT 
        u.id, u.name, u.email, u.role, u.phone, u.city, u.state, u.pincode, u.profile_image, u.is_verified, u.joined_date, u.is_active,
        (SELECT COUNT(*) FROM products WHERE seller_id = u.id) as items_listed,
        (SELECT COUNT(*) FROM orders WHERE buyer_id = u.id) as items_bought
      FROM users u
      ORDER BY u.id DESC
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getUserDetail = async (req, res) => {
  try {
    const { id } = req.params;
    
    // User basic info
    const userResult = await pool.query(
      "SELECT id, name, email, phone, city, state, pincode, bio, profile_image, is_verified, seller_badge, rating, total_sold, total_bought, preferences, joined_date, role FROM users WHERE id = $1",
      [id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = userResult.rows[0];

    // User's Products
    const productsResult = await pool.query(
      "SELECT * FROM products WHERE seller_id = $1 ORDER BY id DESC",
      [id]
    );

    // User's Buy Orders
    const buyOrdersResult = await pool.query(
      `SELECT o.*, p.title, p.price as product_price 
       FROM orders o 
       JOIN products p ON o.product_id = p.id 
       WHERE o.buyer_id = $1 ORDER BY o.created_at DESC`,
      [id]
    );

    // User's Sell Orders
    const sellOrdersResult = await pool.query(
      `SELECT o.*, p.title, p.price as product_price 
       FROM orders o 
       JOIN products p ON o.product_id = p.id 
       WHERE o.seller_id = $1 ORDER BY o.created_at DESC`,
      [id]
    );

    res.json({
      user,
      products: productsResult.rows,
      buyOrders: buyOrdersResult.rows,
      sellOrders: sellOrdersResult.rows
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.toggleUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;
    const result = await pool.query(
      "UPDATE users SET is_active = $1 WHERE id = $2 RETURNING id, is_active",
      [is_active, id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: "User not found" });

    // Log the action
    await logAdminAction(
      req.user.id, 
      is_active ? 'reactivate_user' : 'suspend_user', 
      'user', 
      id, 
      { is_active }, 
      req.ip
    );

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query("DELETE FROM users WHERE id=$1", [id]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    // Log the action
    await logAdminAction(req.user.id, 'delete_user', 'user', id, {}, req.ip);

    res.json({ message: "User deleted" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getProducts = async (req, res) => {
  try {
    const query = `
      SELECT 
        p.*, 
        c.name as category_name, 
        u.name as seller_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN users u ON p.seller_id = u.id
      ORDER BY p.id DESC
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.updateProductStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;
    
    if (!['approved', 'pending', 'rejected'].includes(status)) {
      return res.status(400).json({ error: "Invalid status value" });
    }

    const result = await pool.query(
      "UPDATE products SET status=$1, rejection_reason=$2 WHERE id=$3", 
      [status, status === 'rejected' ? reason : null, id]
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    // Log the action
    await logAdminAction(req.user.id, `update_product_status_${status}`, 'product', id, { status, reason }, req.ip);

    // Get the product to find the seller_id
    const productRes = await pool.query("SELECT seller_id, title FROM products WHERE id = $1", [id]);
    if (productRes.rows.length > 0) {
      const product = productRes.rows[0];
      const isApproved = status === 'approved';
      
      await notificationService.createNotification({
        user_id: product.seller_id,
        title: isApproved ? "Listing Approved! 🚀" : "Listing Update Needed",
        message: isApproved 
          ? `Your listing "${product.title}" has been approved and is now live.`
          : `Your listing "${product.title}" has been reviewed and requires updates.${reason ? ` Reason: ${reason}` : ''}`,
        type: isApproved ? 'success' : 'warning',
        link: '/profile?tab=selling'
      });
    }

    res.json({ message: "Product status updated" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    // Cascade cleanup before deleting
    await pool.query("DELETE FROM bids WHERE product_id = $1", [id]);
    await pool.query("DELETE FROM watchlist WHERE product_id = $1", [id]);
    await pool.query("DELETE FROM product_deals WHERE product_id = $1", [id]);
    await pool.query("DELETE FROM product_offers WHERE product_id = $1", [id]);
    await pool.query("DELETE FROM messages WHERE chat_id IN (SELECT id FROM chats WHERE product_id = $1)", [id]);
    await pool.query("DELETE FROM chats WHERE product_id = $1", [id]);
    const result = await pool.query("DELETE FROM products WHERE id=$1", [id]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    // Log the action
    await logAdminAction(req.user.id, 'delete_product', 'product', id, {}, req.ip);

    res.json({ message: "Product deleted" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getAnalytics = async (req, res) => {
  try {
    const { range = '30' } = req.query;
    const days = parseInt(range);

    // New Users over time
    const userQuery = `
      SELECT DATE(joined_date) as date, COUNT(*) as count
      FROM users
      WHERE joined_date >= NOW() - INTERVAL '1 day' * $1
      GROUP BY DATE(joined_date)
      ORDER BY DATE(joined_date) ASC
    `;
    const userStats = await pool.query(userQuery, [days]);

    // New Products over time
    const productQuery = `
      SELECT DATE(created_at) as date, COUNT(*) as count
      FROM products
      WHERE created_at >= NOW() - INTERVAL '1 day' * $1
      GROUP BY DATE(created_at)
      ORDER BY DATE(created_at) ASC
    `;
    const productStats = await pool.query(productQuery, [days]);

    // Orders over time
    const orderQuery = `
      SELECT DATE(created_at) as date, COUNT(*) as count
      FROM orders
      WHERE created_at >= NOW() - INTERVAL '1 day' * $1
      GROUP BY DATE(created_at)
      ORDER BY DATE(created_at) ASC
    `;
    const orderStats = await pool.query(orderQuery, [days]);

    res.json({
      users: userStats.rows,
      products: productStats.rows,
      orders: orderStats.rows
    });
  } catch (error) {
    console.error("Error fetching analytics:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.getLogs = async (req, res) => {
  try {
    const query = `
      SELECT al.*, u.name as admin_name 
      FROM admin_audit_logs al
      LEFT JOIN users u ON al.admin_id = u.id
      ORDER BY al.created_at DESC
      LIMIT 100
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch logs" });
  }
};

exports.getSettings = async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM platform_settings");
    const settings = {};
    result.rows.forEach(row => {
      settings[row.key] = row.value;
    });
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch settings" });
  }
};

exports.updateSetting = async (req, res) => {
  try {
    const { key, value } = req.body;
    await pool.query(
      "UPDATE platform_settings SET value = $1, updated_by = $2, updated_at = NOW() WHERE key = $3",
      [value, req.user.id, key]
    );
    
    await logAdminAction(req.user.id, 'update_setting', 'setting', null, { key, value }, req.ip);
    
    res.json({ message: "Setting updated" });
  } catch (error) {
    res.status(500).json({ error: "Failed to update setting" });
  }
};

exports.getOrders = async (req, res) => {
  try {
    // UPDATED to use product_deals for the 7-stage lifecycle display
    const query = `
      SELECT d.*,
        p.title as product_title,
        u1.name as buyer_name, u1.email as buyer_email,
        u2.name as seller_name, u2.email as seller_email
      FROM product_deals d
      LEFT JOIN products p ON d.product_id = p.id
      LEFT JOIN users u1 ON d.buyer_id = u1.id
      LEFT JOIN users u2 ON d.seller_id = u2.id
      ORDER BY d.created_at DESC
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.resolveDeal = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, resolution_notes } = req.body;

    if (!['CONFIRMED', 'CANCELLED', 'DISPUTED'].includes(status)) {
      return res.status(400).json({ error: "Invalid resolution status. Must be CONFIRMED, CANCELLED, or DISPUTED." });
    }

    const result = await pool.query(
      "UPDATE product_deals SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
      [status, id]
    );

    if (result.rowCount === 0) return res.status(404).json({ error: "Deal not found" });

    // If cancelled, reset product to approved
    if (status === 'CANCELLED') {
        await pool.query("UPDATE products SET status = 'approved' WHERE id = $1", [result.rows[0].product_id]);
    }

    await logAdminAction(req.user.id, `resolve_deal_${status}`, 'deal', id, { status, resolution_notes }, req.ip);

    // Notify Buyer and Seller
    const deal = result.rows[0];
    const productRes = await pool.query("SELECT title FROM products WHERE id = $1", [deal.product_id]);
    const productTitle = productRes.rows[0]?.title || "Watch";

    // To Buyer
    await notificationService.createNotification({
      user_id: deal.buyer_id,
      title: `Deal ${status.toLowerCase()}`,
      message: `The deal for "${productTitle}" has been marked as ${status}.`,
      type: status === 'CONFIRMED' ? 'success' : 'info',
      link: '/profile?tab=buying'
    });

    // To Seller
    await notificationService.createNotification({
      user_id: deal.seller_id,
      title: `Deal ${status.toLowerCase()}`,
      message: `The deal for "${productTitle}" has been marked as ${status}.`,
      type: status === 'CONFIRMED' ? 'success' : 'info',
      link: '/profile?tab=selling'
    });

    res.json({ message: `Deal resolved as ${status.toUpperCase()}`, deal: result.rows[0] });
  } catch (error) {
      res.status(500).json({ error: error.message });
  }
};

exports.getChats = async (req, res) => {
  try {
    const query = `
      SELECT c.*,
        p.title as product_title,
        u1.name as buyer_name,
        u2.name as seller_name, u2.id as seller_user_id,
        (SELECT COUNT(*) FROM messages m WHERE m.chat_id = c.id) as message_count,
        (SELECT message FROM messages m WHERE m.chat_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_message,
        (SELECT created_at FROM messages m WHERE m.chat_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_message_at
      FROM chats c
      LEFT JOIN products p ON c.product_id = p.id
      LEFT JOIN users u1 ON c.buyer_id = u1.id
      LEFT JOIN users u2 ON c.seller_id = u2.id
      ORDER BY last_message_at DESC NULLS LAST
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Admin notifies a seller about their listing via the messaging system
exports.notifySeller = async (req, res) => {
  try {
    const { product_id, seller_id, message } = req.body;
    const adminId = req.user.id;

    // Find or create a system/admin chat for this product
    // We use buyer_id = adminId so the seller sees a message from admin
    let chat = await pool.query(
      'SELECT * FROM chats WHERE product_id = $1 AND buyer_id = $2 AND seller_id = $3',
      [product_id, adminId, seller_id]
    );

    let chatId;
    if (chat.rows.length === 0) {
      const newChat = await pool.query(
        'INSERT INTO chats (product_id, buyer_id, seller_id) VALUES ($1, $2, $3) RETURNING *',
        [product_id, adminId, seller_id]
      );
      chatId = newChat.rows[0].id;
    } else {
      chatId = chat.rows[0].id;
    }

    // Send the message
    const msg = await pool.query(
      'INSERT INTO messages (chat_id, sender_id, message) VALUES ($1, $2, $3) RETURNING *',
      [chatId, adminId, message]
    );

    // Notify via socket
    const io = req.app?.get('io');
    if (io) {
      io.to(`chat_${chatId}`).emit('newMessage', msg.rows[0]);
    }

    await logAdminAction(adminId, 'notify_seller', 'product', product_id, { seller_id, message }, req.ip);

    res.json({ message: 'Seller notified successfully', chat_id: chatId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Admin creates a product directly (pre-approved)
exports.adminCreateProduct = async (req, res) => {
  try {
    const {
      title, description, price, seller_id,
      category_id, product_type, condition_code,
      item_specifics, condition_details
    } = req.body;

    const images = req.files ? req.files.map(f => f.filename) : [];

    const result = await pool.query(
      `INSERT INTO products
        (title, description, price, seller_id, category_id, product_type, images,
         condition_code, item_specifics, condition_details, status)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'approved')
       RETURNING *`,
      [
        title, description, price || 0, seller_id || req.user.id,
        category_id, product_type || 'fixed',
        JSON.stringify(images),
        condition_code || null,
        typeof item_specifics === 'string' ? item_specifics : JSON.stringify(item_specifics || {}),
        typeof condition_details === 'string' ? condition_details : JSON.stringify(condition_details || {})
      ]
    );

    await logAdminAction(req.user.id, 'admin_create_product', 'product', result.rows[0].id, { title }, req.ip);

    res.json({ message: 'Product created and approved', product: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Admin can view full chat history for auditing
exports.getChatHistory = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT m.*, u.name as sender_name 
       FROM messages m 
       LEFT JOIN users u ON m.sender_id = u.id 
       WHERE m.chat_id = $1 
       ORDER BY m.created_at ASC`,
      [id]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch chat history" });
  }
};

// Report Management Delegation
const reportController = require('./reportController');
exports.getReports = reportController.getReports;
exports.resolveReport = reportController.resolveReport;