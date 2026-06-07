const pool = require("../config/db");
const { logAdminAction } = require("../utils/adminLogger");
const notificationService = require("../services/notificationService");
const cache = require("../services/cacheService");
const watchRegister = require("../services/watchRegisterService");
const Razorpay = require("razorpay");

let razorpay;
if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
  razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
}

exports.getStats = async (req, res) => {
  try {
    const cached = await cache.get("admin:stats");
    if (cached) return res.json(cached);

    const stats = {};
    await Promise.all([
      pool.query("SELECT COUNT(*) as c FROM users").then(r => stats.totalUsers = parseInt(r.rows[0].c) || 0),
      pool.query("SELECT COUNT(*) as c FROM products WHERE status = 'approved'").then(r => stats.liveProducts = parseInt(r.rows[0].c) || 0),
      pool.query("SELECT COUNT(*) as c FROM products WHERE status = 'pending'").then(r => stats.pendingVerifications = parseInt(r.rows[0].c) || 0),
      pool.query("SELECT COUNT(*) as c FROM watchlist").then(r => stats.totalWatchlists = parseInt(r.rows[0].c) || 0),
      pool.query("SELECT COALESCE(SUM(price),0) as s FROM products WHERE status = 'approved'").then(r => stats.totalValue = parseFloat(r.rows[0].s) || 0),
      pool.query("SELECT COUNT(*) as c, COALESCE(SUM(amount),0) as rev, COALESCE(SUM(commission_amount),0) as comm FROM product_deals WHERE status = 'CONFIRMED'").then(r => {
        stats.totalOrders = parseInt(r.rows[0].c) || 0;
        stats.grossTurnover = parseFloat(r.rows[0].rev) || 0;
        stats.commissionEarned = parseFloat(r.rows[0].comm) || 0;
      }),
      pool.query("SELECT COALESCE(SUM(seller_payout),0) as s FROM product_deals WHERE status = 'CONFIRMED' AND payout_status = 'PENDING'").then(r => stats.pendingPayouts = parseFloat(r.rows[0].s) || 0),
      pool.query("SELECT COUNT(*) as c FROM products WHERE status = 'approved' AND product_type = 'auction'").then(r => stats.activeAuctions = parseInt(r.rows[0].c) || 0),
      pool.query("SELECT COUNT(DISTINCT seller_id) as c FROM products").then(r => stats.activeSellers = parseInt(r.rows[0].c) || 0),
      pool.query("SELECT COUNT(DISTINCT buyer_id) as c FROM product_deals").catch(() => ({ rows: [{ c: 0 }] })).then(r => stats.totalBuyers = parseInt(r.rows[0].c) || 0),
      pool.query("SELECT COUNT(*) as c FROM bids").catch(() => ({ rows: [{ c: 0 }] })).then(r => stats.totalBids = parseInt(r.rows[0].c) || 0),
      pool.query("SELECT COALESCE(MAX(bid_amount),0) as m FROM bids").catch(() => ({ rows: [{ m: 0 }] })).then(r => stats.highestBid = parseFloat(r.rows[0].m) || 0),
      pool.query("SELECT COUNT(*) as c FROM visitor_logs").catch(() => ({ rows: [{ c: 0 }] })).then(r => stats.totalVisitors = parseInt(r.rows[0].c) || 0),
    ]);

    cache.set("admin:stats", stats);
    res.json(stats);
  } catch (error) {
    console.error("Error fetching admin stats:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.getUsers = async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const query = `
      SELECT 
        u.id, u.name, u.email, u.role, u.phone, u.city, u.state, u.pincode, u.profile_image, u.is_verified, u.joined_date, u.is_active, u.payment_methods,
        (SELECT COUNT(*) FROM products WHERE seller_id = u.id) as items_listed,
        (SELECT COUNT(*) FROM product_deals WHERE buyer_id = u.id) as items_bought
      FROM users u
      ORDER BY u.id DESC
      LIMIT $1 OFFSET $2
    `;
    const result = await pool.query(query, [parseInt(limit), offset]);
    const countResult = await pool.query("SELECT COUNT(*) FROM users");
    res.json({ users: result.rows, total: parseInt(countResult.rows[0].count) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getUserDetail = async (req, res) => {
  try {
    const { id } = req.params;

    // User basic info
    const userResult = await pool.query(
      "SELECT id, name, email, phone, city, state, pincode, bio, profile_image, is_verified, seller_badge, rating, total_sold, total_bought, preferences, joined_date, role, payment_methods FROM users WHERE id = $1",
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

    const buyOrdersResult = await pool.query(
      `SELECT d.*, p.title, p.price as product_price 
       FROM product_deals d 
       JOIN products p ON d.product_id = p.id 
       WHERE d.buyer_id = $1 ORDER BY d.created_at DESC`,
      [id]
    );

    const sellOrdersResult = await pool.query(
      `SELECT d.*, p.title, p.price as product_price 
       FROM product_deals d 
       JOIN products p ON d.product_id = p.id 
       WHERE d.seller_id = $1 ORDER BY d.created_at DESC`,
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

exports.getProducts = async (req, res) => {
      try {
        const { page = 1, limit = 50 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        const query = `
      SELECT 
        p.*, 
        c.name as category_name, 
        u.name as seller_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN users u ON p.seller_id = u.id
      ORDER BY p.id DESC
      LIMIT $1 OFFSET $2
    `;
        const result = await pool.query(query, [parseInt(limit), offset]);
        const countResult = await pool.query("SELECT COUNT(*) FROM products");
        res.json({ products: result.rows, total: parseInt(countResult.rows[0].count) });
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

        // ─── Stolen Serial Check (runs ONLY when admin clicks "Approve") ──────
        if (status === 'approved') {
          const productRes = await pool.query(
            "SELECT serial_number, title, item_specifics FROM products WHERE id = $1",
            [id]
          );
          if (productRes.rows.length === 0) {
            return res.status(404).json({ error: "Product not found" });
          }

          const product = productRes.rows[0];

          // Extract serial from dedicated column OR from item_specifics JSON blob
          let serialToCheck = product.serial_number || null;
          if (!serialToCheck && product.item_specifics) {
            try {
              const specs = typeof product.item_specifics === 'string'
                ? JSON.parse(product.item_specifics)
                : product.item_specifics;
              serialToCheck = specs?.serial_number || specs?.serialNumber || specs?.serial || null;
            } catch (_) {}
          }

          // Extract brand similarly
          let brand = "";
          if (product.item_specifics) {
            try {
              const specs = typeof product.item_specifics === 'string'
                ? JSON.parse(product.item_specifics)
                : product.item_specifics;
              brand = specs?.brand || specs?.Brand || specs?.make || "";
            } catch (_) {}
          }

          const checkResult = await watchRegister.checkSerial(serialToCheck, brand);

          if (checkResult.flagged) {
            // Auto-reject — admin cannot override a flagged serial
            await pool.query(
              `UPDATE products SET status = 'rejected', rejection_reason = $1 WHERE id = $2`,
              [`🚨 STOLEN ASSET ALERT: This serial number (${serialToCheck}) has been flagged by the Watch Register database. Reason: ${checkResult.reason}. Source: ${checkResult.source}`, id]
            );

            await logAdminAction(
              req.user.id, 'auto_rejected_stolen_serial', 'product', id,
              { serial: serialToCheck, reason: checkResult.reason, source: checkResult.source },
              req.ip
            );

            // Notify seller
            await notificationService.createNotification({
              user_id: product.seller_id,
              title: "Listing Rejected — Stolen Asset Alert 🚨",
              message: `Your listing "${product.title}" has been automatically rejected because its serial number is flagged in a stolen assets database. If you believe this is an error, please contact Aera support with proof of ownership.`,
              type: 'error',
              link: '/profile?tab=selling'
            }).catch(() => {});

            return res.status(403).json({
              error: "STOLEN_ASSET_FLAGGED",
              message: `This listing cannot be approved. Serial number "${serialToCheck}" is flagged in the stolen watch database.`,
              reason: checkResult.reason,
              source: checkResult.source,
            });
          }

          // Serial is clean — log it and proceed
          console.log(`[WatchRegister] Serial "${serialToCheck}" passed check (source: ${checkResult.source})`);
        }
        // ─── End of Serial Check ───────────────────────────────────────────────

        const result = await pool.query(
          `UPDATE products 
       SET status=$1, 
           rejection_reason=$2,
           auction_end = CASE WHEN $4 = 'approved' AND allow_auction = true AND auction_end < CURRENT_TIMESTAMP THEN CURRENT_TIMESTAMP + INTERVAL '7 days' ELSE auction_end END
       WHERE id=$3 RETURNING *`,
          [status, status === 'rejected' ? reason : null, id, status]
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

        const [userStats, productStats, orderStats, revenueStats, topSellers, conversionStats] = await Promise.all([
          pool.query(`
        SELECT DATE(joined_date) as date, COUNT(*) as count
        FROM users WHERE joined_date >= NOW() - INTERVAL '1 day' * $1
        GROUP BY DATE(joined_date) ORDER BY DATE(joined_date) ASC
      `, [days]),

          pool.query(`
        SELECT DATE(created_at) as date, COUNT(*) as count
        FROM products WHERE created_at >= NOW() - INTERVAL '1 day' * $1
        GROUP BY DATE(created_at) ORDER BY DATE(created_at) ASC
      `, [days]),

          pool.query(`
        SELECT DATE(created_at) as date, COUNT(*) as count, SUM(amount) as revenue
        FROM product_deals WHERE created_at >= NOW() - INTERVAL '1 day' * $1
        GROUP BY DATE(created_at) ORDER BY DATE(created_at) ASC
      `, [days]),

          pool.query(`
        SELECT COALESCE(SUM(amount), 0) as total_revenue,
               COALESCE(SUM(total_platform_fee), 0) as total_fees,
               COALESCE(SUM(seller_payout), 0) as total_payouts
        FROM product_deals WHERE status = 'CONFIRMED' AND created_at >= NOW() - INTERVAL '1 day' * $1
      `, [days]),

          pool.query(`
        SELECT u.id, u.name, u.is_verified,
               COUNT(pd.id) as deals_count,
               COALESCE(SUM(pd.amount), 0) as revenue
        FROM product_deals pd
        JOIN users u ON u.id = pd.seller_id
        WHERE pd.status = 'CONFIRMED' AND pd.created_at >= NOW() - INTERVAL '1 day' * $1
        GROUP BY u.id, u.name, u.is_verified
        ORDER BY revenue DESC LIMIT 10
      `, [days]),

          pool.query(`
        SELECT
          COUNT(*) as total_deals,
          SUM(CASE WHEN status = 'CONFIRMED' THEN 1 ELSE 0 END) as confirmed,
          ROUND(100.0 * SUM(CASE WHEN status = 'CONFIRMED' THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) as conversion_rate
        FROM product_deals WHERE created_at >= NOW() - INTERVAL '1 day' * $1
      `, [days])
        ]);

        res.json({
          users: userStats.rows,
          products: productStats.rows,
          orders: orderStats.rows,
          revenue: revenueStats.rows[0],
          topSellers: topSellers.rows,
          conversion: conversionStats.rows[0],
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
        const { page = 1, limit = 50 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);
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
      LIMIT $1 OFFSET $2
    `;
        const result = await pool.query(query, [parseInt(limit), offset]);
        const countResult = await pool.query("SELECT COUNT(*) FROM product_deals");
        res.json({ orders: result.rows, total: parseInt(countResult.rows[0].count) });
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

        // If cancelled, reset product to approved and extend auction if needed
        if (status === 'CANCELLED') {
          await pool.query(`
          UPDATE products 
          SET status = 'approved',
              auction_end = CASE WHEN allow_auction = true AND auction_end < CURRENT_TIMESTAMP THEN CURRENT_TIMESTAMP + INTERVAL '3 days' ELSE auction_end END
          WHERE id = $1`, [result.rows[0].product_id]
          );
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
          item_specifics, condition_details,
          allow_buy_now, buy_now_price,
          allow_auction, starting_bid, auction_end,
          allow_offers
        } = req.body;

        const images = req.files ? req.files.map(f => f.path) : [];

        const result = await pool.query(
          `INSERT INTO products
        (title, description, price, seller_id, category_id, product_type, images,
         condition_code, item_specifics, condition_details, status,
         allow_buy_now, buy_now_price, allow_auction, starting_bid, auction_end, allow_offers)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'approved', $11, $12, $13, $14, $15, $16)
       RETURNING *`,
          [
            title, description, price || 0, seller_id || req.user.id,
            category_id, product_type || 'fixed',
            JSON.stringify(images),
            condition_code || null,
            typeof item_specifics === 'string' ? item_specifics : JSON.stringify(item_specifics || {}),
            typeof condition_details === 'string' ? condition_details : JSON.stringify(condition_details || {}),
            allow_buy_now || false,
            buy_now_price || price || 0,
            allow_auction || false,
            starting_bid || 0,
            auction_end || null,
            allow_offers || false
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

    // Reports management delegation
    const reportController = require('./reportController');
    exports.getReports = reportController.getReports;
    exports.resolveReport = reportController.resolveReport;

    // Financials and Escrow
    exports.getEscrowDeals = async (req, res) => {
      try {
        const result = await pool.query(`
      SELECT d.*, p.title as product_title, 
             u_buyer.name as buyer_name, u_seller.name as seller_name,
             u_seller.payment_methods as seller_payment_info
      FROM product_deals d
      JOIN products p ON d.product_id = p.id
      JOIN users u_buyer ON d.buyer_id = u_buyer.id
      JOIN users u_seller ON d.seller_id = u_seller.id
      WHERE d.status = 'CONFIRMED'
      ORDER BY d.created_at DESC
    `);
        res.json(result.rows);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    };

    exports.releasePayout = async (req, res) => {
      try {
        const { id } = req.params;
        const adminId = req.user.id;

        const dealCheck = await pool.query("SELECT * FROM product_deals WHERE id = $1", [id]);
        if (dealCheck.rows.length === 0) return res.status(404).json({ message: "Deal not found" });

        const deal = dealCheck.rows[0];
        if (deal.status !== 'CONFIRMED') {
          return res.status(400).json({ message: "Payout can only be released for CONFIRMED deals" });
        }

        if (deal.payout_status === 'RELEASED') {
          return res.status(400).json({ message: "Payout already released" });
        }

        const result = await pool.query(
          `UPDATE product_deals 
       SET payout_status = 'RELEASED', 
           payout_released_at = CURRENT_TIMESTAMP, 
           payout_released_by = $1, 
           updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2 
       RETURNING *`,
          [adminId, id]
        );

        // Notify Seller
        try {
          const productRes = await pool.query("SELECT title FROM products WHERE id = $1", [deal.product_id]);
          await notificationService.createNotification({
            user_id: deal.seller_id,
            title: "Payout Released! 🏦",
            message: `Your payout for "${productRes.rows[0]?.title || 'Watch'}" has been released to your registered payment method.`,
            type: 'success',
            link: '/profile?tab=selling'
          });
        } catch (err) { console.error("Payout notification failed:", err.message); }

        // Fetch current seller balance snapshot for user_ledgers
        const currentBalanceRes = await pool.query("SELECT COALESCE(SUM(CASE WHEN transaction_type = 'CREDIT' THEN amount ELSE -amount END), 0) as balance FROM user_ledgers WHERE user_id = $1", [deal.seller_id]);
        const currentBalance = parseFloat(currentBalanceRes.rows[0].balance || 0);
        const newBalance = currentBalance - parseFloat(deal.seller_payout);

        // Debit the seller's user_ledger
        await pool.query(
          "INSERT INTO user_ledgers (user_id, deal_id, amount, transaction_type, reference_type, balance_snapshot, description) VALUES ($1, $2, $3, 'DEBIT', 'PAYOUT', $4, $5)",
          [deal.seller_id, deal.id, deal.seller_payout, newBalance, 'Platform payout released to seller bank account']
        );

        // Log payout to financial_ledger (Admin audit log)
        await pool.query(
          "INSERT INTO financial_ledger (deal_id, user_id, amount, type, status) VALUES ($1, $2, $3, 'PAYOUT', 'RELEASED')",
          [deal.id, deal.seller_id, deal.seller_payout]
        );

        await logAdminAction(adminId, 'release_payout', 'deal', id, { amount: deal.seller_payout }, req.ip);

        res.json({ message: 'Payout released successfully', deal: result.rows[0] });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    };

    exports.getFinancials = async (req, res) => {
      try {
        const stats = await pool.query(`
      SELECT 
        SUM(amount) as gmv,
        SUM(commission_amount) as total_commission,
        SUM(platform_gst_amount) as total_platform_gst,
        SUM(total_platform_fee) as total_revenue,
        COUNT(*) as total_deals
      FROM product_deals 
      WHERE status = 'CONFIRMED'
    `);

        const pending = await pool.query(`
      SELECT SUM(seller_payout) as pending_payouts 
      FROM product_deals 
      WHERE status = 'CONFIRMED' AND payout_status = 'PENDING'
    `);

        res.json({
          ...stats.rows[0],
          pending_payouts: pending.rows[0]?.pending_payouts || 0
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    };

    exports.getAuctions = async (req, res) => {
      try {
        const query = `
      SELECT 
        p.id, p.title, p.price as starting_bid, p.reserve_price, p.current_bid, p.auction_end,
        u.name as seller_name,
        (SELECT COUNT(*) FROM bids WHERE product_id = p.id) as bid_count,
        (SELECT MAX(bid_amount) FROM bids WHERE product_id = p.id) as max_bid
      FROM products p
      LEFT JOIN users u ON p.seller_id = u.id
      WHERE p.allow_auction = true
      ORDER BY p.auction_end ASC
    `;
        const result = await pool.query(query);
        res.json(result.rows);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    };

    exports.getBids = async (req, res) => {
      try {
        const query = `
      SELECT 
        b.*, 
        p.title as product_title, 
        u.name as bidder_name, u.email as bidder_email
      FROM bids b
      JOIN products p ON b.product_id = p.id
      JOIN users u ON b.user_id = u.id
      ORDER BY b.created_at DESC
      LIMIT 200
    `;
        const result = await pool.query(query);
        res.json(result.rows);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    };

    exports.verifyPayment = async (req, res) => {
      try {
        const { id } = req.params;
        const { status } = req.body; // 'PAID' or 'REJECTED'
        const adminId = req.user.id;

        if (!['PAID', 'REJECTED'].includes(status)) {
          return res.status(400).json({ error: "Invalid verification status. Must be PAID or REJECTED." });
        }

        const result = await pool.query(
          `UPDATE product_deals 
       SET status = $1, payment_status = $2, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $3 AND status = 'PAID' 
       RETURNING *`,
          [status === 'PAID' ? 'PAID' : 'AWAITING_PAYMENT', status === 'PAID' ? 'PAID' : 'PENDING', id]
        );

        if (result.rows.length === 0) {
          return res.status(404).json({ message: "Deal not found or not in PAID state awaiting verification" });
        }

        const deal = result.rows[0];
        const productRes = await pool.query("SELECT title FROM products WHERE id = $1", [deal.product_id]);
        const productTitle = productRes.rows[0]?.title || "Watch";

        if (status === 'PAID') {
          // Notify Seller to ship
          await notificationService.createNotification({
            user_id: deal.seller_id,
            title: "Payment Verified! 💸",
            message: `The payment for "${productTitle}" has been verified by Admin. You can now ship the item.`,
            type: 'success',
            link: '/profile?tab=selling',
            channels: ['in_app', 'email', 'sms', 'whatsapp']
          });
          // Notify Buyer
          await notificationService.createNotification({
            user_id: deal.buyer_id,
            title: "Payment Confirmed! ✅",
            message: `Your payment for "${productTitle}" has been verified. The seller will ship your item soon.`,
            type: 'success',
            link: '/profile?tab=buying',
            channels: ['in_app', 'email', 'sms', 'whatsapp']
          });
        } else {
          // REJECTED - Notify Buyer
          await notificationService.createNotification({
            user_id: deal.buyer_id,
            title: "Payment Rejected ❌",
            message: `Your payment for "${productTitle}" was rejected. Please contact support or re-upload the receipt.`,
            type: 'error',
            link: '/profile?tab=buying',
            channels: ['in_app', 'email', 'sms', 'whatsapp']
          });
        } // end else (REJECTED)

        await logAdminAction(adminId, `verify_payment_${status}`, 'deal', id, { status }, req.ip);

        res.json({ message: `Payment ${status} successfully`, deal: result.rows[0] });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    };

    exports.processRefund = async (req, res) => {
      try {
        const { id } = req.params;
        const adminId = req.user.id;

        // 1. Fetch deal details to verify state
        const dealCheck = await pool.query("SELECT * FROM product_deals WHERE id = $1", [id]);
        if (dealCheck.rows.length === 0) return res.status(404).json({ message: "Deal not found" });

        const deal = dealCheck.rows[0];
        if (deal.status !== 'REFUND_PENDING') {
          return res.status(400).json({ message: "Refund can only be processed for deals in REFUND_PENDING state." });
        }

        // 2. Finalize the refund in database
        const result = await pool.query(
          `UPDATE product_deals 
       SET status = 'CANCELLED', 
           updated_at = CURRENT_TIMESTAMP 
       WHERE id = $1 
       RETURNING *`,
          [id]
        );

        // Razorpay Refund Integration
        if (deal.payment_method === 'RAZORPAY' && deal.payment_receipt) {
          if (!razorpay) {
            throw new Error("Razorpay SDK is not initialized. Check environment variables.");
          }
          try {
            // Note: If Razorpay throws an error (e.g. payment already refunded), we catch and log it,
            // but we still proceed to cancel the deal in the database.
            await razorpay.payments.refund(deal.payment_receipt);
            console.log(`Razorpay refund processed for deal ID: ${deal.id}, Payment ID: ${deal.payment_receipt}`);
          } catch (refundError) {
             console.error(`Razorpay refund failed for deal ${deal.id}:`, refundError.message || refundError);
             throw new Error(`Razorpay refund failed: ${refundError.error?.description || refundError.message}`);
          }
        }

        // 3. Reactivate the product for the marketplace and extend auction if needed
        await pool.query(`
      UPDATE products 
      SET status = 'approved',
          auction_end = CASE WHEN allow_auction = true AND auction_end < CURRENT_TIMESTAMP THEN CURRENT_TIMESTAMP + INTERVAL '3 days' ELSE auction_end END
      WHERE id = $1`, [deal.product_id]
        );

        // 4. Log the admin action
        await logAdminAction(adminId, 'process_refund', 'deal', id, { amount: deal.amount }, req.ip);

        // 5. Notify the Buyer
        try {
          const productRes = await pool.query("SELECT title FROM products WHERE id = $1", [deal.product_id]);
          await notificationService.createNotification({
            user_id: deal.buyer_id,
            title: "Refund Processed! 💰",
            message: `The refund for your order of "${productRes.rows[0]?.title || 'Watch'}" has been processed and sent back to your account.`,
            type: 'success',
            link: '/profile?tab=buying'
          });
        } catch (err) { console.error("Refund notification failed:", err.message); }

        res.json({ message: 'Refund marked as processed. Product has been reactivated.', deal: result.rows[0] });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    };

    exports.getTaxReport = async (req, res) => {
      try {
        const { startDate, endDate } = req.query;

        let query = `
      SELECT 
        d.id as deal_id,
        d.created_at,
        d.status as deal_status,
        d.amount as gross_amount,
        d.commission_amount,
        d.platform_gst_amount,
        d.total_platform_fee,
        d.seller_payout,
        d.seller_gst_applicable,
        d.seller_gst_number,
        d.tcs_rate,
        d.tcs_amount,
        u_seller.name as seller_name,
        u_seller.state as seller_state,
        u_seller.pan_number,
        u_seller.gst_enrolment_id,
        u_buyer.name as buyer_name,
        u_buyer.state as buyer_state
      FROM product_deals d
      JOIN users u_seller ON d.seller_id = u_seller.id
      JOIN users u_buyer ON d.buyer_id = u_buyer.id
      WHERE d.status IN ('PAID', 'SHIPPED', 'DELIVERED', 'CONFIRMED')
    `;

        const params = [];
        if (startDate && endDate) {
          query += ` AND d.created_at BETWEEN $1 AND $2`;
          params.push(startDate, endDate);
        }

        query += ` ORDER BY d.created_at DESC`;

        const result = await pool.query(query, params);

        // Calculate Totals
        let totalGross = 0;
        let totalCommission = 0;
        let totalPlatformGst = 0;
        let totalTCS = 0;

        result.rows.forEach(row => {
          totalGross += parseFloat(row.gross_amount || 0);
          totalCommission += parseFloat(row.commission_amount || 0);
          totalPlatformGst += parseFloat(row.platform_gst_amount || 0);
          totalTCS += parseFloat(row.tcs_amount || 0);
        });

        res.json({
          summary: {
            total_transactions: result.rows.length,
            total_gross_value: totalGross,
            total_commission: totalCommission,
            total_platform_gst: totalPlatformGst,
            total_tcs_deducted: totalTCS
          },
          transactions: result.rows
        });

      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    };

    // Get Global Financial Ledger for Admin (All transactions)
    exports.getGlobalFinancialLedger = async (req, res) => {
      const { startDate, endDate, status, search, year } = req.query;

      try {
        let query = `
      SELECT 
        d.*, 
        p.title as product_title, 
        p.images as product_image,
        b.name as buyer_name,
        b.email as buyer_email,
        s.name as seller_name,
        s.email as seller_email,
        (d.amount + d.shipping_fee + d.buyer_commission_amount + (d.buyer_commission_amount * 0.18)) as total_buyer_cost
      FROM product_deals d
      JOIN products p ON d.product_id = p.id
      JOIN users b ON d.buyer_id = b.id
      JOIN users s ON d.seller_id = s.id
      WHERE 1=1
    `;

        const params = [];
        let paramCount = 0;

        if (startDate) {
          paramCount++;
          query += ` AND d.created_at >= $${paramCount}`;
          params.push(startDate);
        }
        if (endDate) {
          paramCount++;
          query += ` AND d.created_at <= $${paramCount}`;
          params.push(endDate + ' 23:59:59');
        }
        if (year && !startDate && !endDate) {
          paramCount++;
          query += ` AND EXTRACT(YEAR FROM d.created_at) = $${paramCount}`;
          params.push(year);
        }
        if (status && status !== 'ALL') {
          paramCount++;
          query += ` AND d.status = $${paramCount}`;
          params.push(status);
        }
        if (search) {
          paramCount++;
          query += ` AND (p.title ILIKE $${paramCount} OR b.name ILIKE $${paramCount} OR s.name ILIKE $${paramCount} OR d.id::text = $${paramCount})`;
          params.push(`%${search}%`);
        }

        query += ` ORDER BY d.created_at DESC`;

        const result = await pool.query(query, params);

        // Calculate Global Summary for the current filtered view
        let totalGross = 0;
        let totalCommissions = 0;
        let totalGst = 0;
        let totalShipping = 0;

        result.rows.forEach(row => {
          totalGross += parseFloat(row.amount || 0);
          totalCommissions += parseFloat(row.total_platform_fee || 0);
          totalGst += parseFloat(row.platform_gst_amount || 0);
          totalShipping += parseFloat(row.shipping_fee || 0);
        });

        res.json({
          summary: {
            total_deals: result.rows.length,
            gross_merchandise_value: totalGross,
            platform_revenue: totalCommissions,
            gst_collected: totalGst,
            shipping_handled: totalShipping
          },
          ledger: result.rows
        });
      } catch (error) {
        console.error("Global Ledger Error:", error);
        res.status(500).json({ error: error.message });
      }
    };

    // ── Category Management ──

    exports.createCategory = async (req, res) => {
      try {
        const { name, description } = req.body;
        if (!name) return res.status(400).json({ error: "Category name is required" });
        const result = await pool.query(
          "INSERT INTO categories (name, description) VALUES ($1, $2) RETURNING *",
          [name, description || null]
        );
        await logAdminAction(req.user?.id, "CREATE", "Category", result.rows[0].id, `Created category: ${name}`);
        res.status(201).json(result.rows[0]);
      } catch (error) {
        console.error("Create Category Error:", error);
        res.status(500).json({ error: error.message });
      }
    };

    exports.updateCategory = async (req, res) => {
      try {
        const { id } = req.params;
        const { name, description } = req.body;
        const result = await pool.query(
          "UPDATE categories SET name = COALESCE($1, name), description = COALESCE($2, description) WHERE id = $3 RETURNING *",
          [name, description, id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: "Category not found" });
        await logAdminAction(req.user?.id, "UPDATE", "Category", id, `Updated category: ${name || ''}`);
        res.json(result.rows[0]);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    };

    exports.deleteUser = async (req, res) => {
      const client = await pool.connect();
      try {
        const { id } = req.params;

        // Start Transaction
        await client.query('BEGIN');

        // 1. Check if user exists
        const userRes = await client.query("SELECT * FROM users WHERE id = $1", [id]);
        if (userRes.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: "User not found" });
        }

        // 2. Delete non-essential PII and temporary data
        await client.query("DELETE FROM user_addresses WHERE user_id = $1", [id]);
        await client.query("DELETE FROM watchlist WHERE user_id = $1", [id]);
        await client.query("DELETE FROM notifications WHERE user_id = $1", [id]);
        await client.query("DELETE FROM product_views WHERE user_id = $1", [id]);
        await client.query("DELETE FROM security_logs WHERE user_id = $1", [id]);

        // 3. Mark their active products as 'deleted' (Preserve for history, hide from site)
        await client.query("UPDATE products SET status = 'deleted' WHERE seller_id = $1", [id]);

        // 4. Cancel any open bids and offers they made
        await client.query("DELETE FROM bids WHERE user_id = $1", [id]);
        await client.query("DELETE FROM product_offers WHERE buyer_id = $1 OR seller_id = $2", [id, id]);

        // 5. Update their Profile to be Anonymized & Deactivated (Soft Delete)
        const anonymizedEmail = `deleted_${id}_${Date.now()}@deleted.user`;
        const anonymizedPhone = `DEL_${id}`;

        await client.query(
          `UPDATE users 
       SET is_active = false, 
           name = 'Deleted User', 
           email = $1, 
           phone = $2, 
           bio = '', 
           profile_image = NULL,
           address = NULL,
           city = NULL,
           state = NULL,
           pincode = NULL,
           pan_number = NULL,
           gst_number = NULL,
           payment_methods = '{}'::jsonb
       WHERE id = $3`,
          [anonymizedEmail, anonymizedPhone, id]
        );

        // Log the soft delete action
        await logAdminAction(req.user.id, 'soft_delete_user', 'user', id, { target_id: id }, req.ip);

        // Commit Transaction
        await client.query('COMMIT');

        res.json({ message: "User soft-deleted and anonymized successfully. Financial history preserved." });
      } catch (error) {
        await client.query('ROLLBACK');
        console.error("User Soft Deletion Error:", error);
        res.status(500).json({ error: "Internal server error" });
      } finally {
        client.release();
      }
    };

    exports.deleteCategory = async (req, res) => {
      try {
        const { id } = req.params;
        await pool.query("UPDATE products SET category_id = NULL WHERE category_id = $1", [id]);
        const result = await pool.query("DELETE FROM categories WHERE id = $1 RETURNING *", [id]);
        if (result.rows.length === 0) return res.status(404).json({ error: "Category not found" });
        await logAdminAction(req.user?.id, "DELETE", "Category", id, `Deleted category: ${result.rows[0].name}`);
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    };

    // ── Brand Management ──

    exports.createBrand = async (req, res) => {
      try {
        const { name, category_id } = req.body;
        if (!name) return res.status(400).json({ error: "Brand name is required" });
        const result = await pool.query(
          "INSERT INTO brands (name, category_id) VALUES ($1, $2) RETURNING *",
          [name, category_id || null]
        );
        await logAdminAction(req.user?.id, "CREATE", "Brand", result.rows[0].id, `Created brand: ${name}`);
        res.status(201).json(result.rows[0]);
      } catch (error) {
        if (error.code === '23505') return res.status(409).json({ error: "Brand already exists" });
        res.status(500).json({ error: error.message });
      }
    };

    exports.deleteBrand = async (req, res) => {
      try {
        const { name } = req.params;
        const result = await pool.query("DELETE FROM brands WHERE name = $1 RETURNING *", [name]);
        if (result.rows.length === 0) return res.status(404).json({ error: "Brand not found" });
        await logAdminAction(req.user?.id, "DELETE", "Brand", result.rows[0].id, `Deleted brand: ${name}`);
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    };

    // ── Audit Log with filtering ──

    exports.getAuditLog = async (req, res) => {
      try {
        const { search, action } = req.query;
        let query = `
      SELECT al.*, u.name as admin_name, u.email as admin_email
      FROM admin_audit_logs al
      LEFT JOIN users u ON al.admin_id = u.id
      WHERE 1=1
    `;
        const params = [];
        if (action && action !== 'ALL') {
          params.push(action);
          query += ` AND al.action = $${params.length}`;
        }
        if (search) {
          params.push(`%${search}%`);
          query += ` AND (al.details ILIKE $${params.length} OR u.name ILIKE $${params.length} OR al.target_type ILIKE $${params.length})`;
        }
        query += " ORDER BY al.created_at DESC LIMIT 200";
        const result = await pool.query(query, params);
        res.json(result.rows);
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch audit log" });
      }
    };
