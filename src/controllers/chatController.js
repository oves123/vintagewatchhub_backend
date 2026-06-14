const pool = require("../config/db");
const notificationService = require("../services/notificationService");
const { calculateDealFinancials } = require("../utils/commissionCalculator");

// Get or Create Chat
exports.createOrGetChat = async (req, res) => {
  try {
    const { product_id, buyer_id, seller_id } = req.body;

    if (buyer_id === seller_id) {
       return res.status(400).json({ error: "You cannot initiate a chat with yourself." });
    }

    // Check if chat exists
    const check = await pool.query(
      "SELECT * FROM chats WHERE product_id = $1 AND buyer_id = $2 AND seller_id = $3",
      [product_id, buyer_id, seller_id]
    );

    const chatQuery = `
      SELECT c.*, p.title as product_title, p.images[0] as product_image, p.price as product_price, p.status as product_status,
             u_buyer.name as buyer_name, u_seller.name as seller_name,
             u_buyer.profile_image as buyer_avatar, u_seller.profile_image as seller_avatar
      FROM chats c
      JOIN products p ON c.product_id = p.id
      JOIN users u_buyer ON c.buyer_id = u_buyer.id
      JOIN users u_seller ON c.seller_id = u_seller.id
      WHERE c.id = $1
    `;

    if (check.rows.length > 0) {
      const fullChat = await pool.query(chatQuery, [check.rows[0].id]);
      return res.json(fullChat.rows[0]);
    }

    // Create new chat
    const result = await pool.query(
      "INSERT INTO chats (product_id, buyer_id, seller_id) VALUES ($1, $2, $3) RETURNING *",
      [product_id, buyer_id, seller_id]
    );

    const newFullChat = await pool.query(chatQuery, [result.rows[0].id]);
    res.status(201).json(newFullChat.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get all chats for a user
exports.getUserChats = async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await pool.query(
      `SELECT c.*, p.title as product_title, p.images[0] as product_image, p.price as product_price, p.status as product_status,
              u_buyer.name as buyer_name, u_seller.name as seller_name,
              u_buyer.profile_image as buyer_avatar, u_seller.profile_image as seller_avatar,
              (SELECT message FROM messages WHERE chat_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
              (SELECT created_at FROM messages WHERE chat_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_at,
              (SELECT count(*) FROM messages WHERE chat_id = c.id AND sender_id != $1 AND is_read = false) as unread_count
       FROM chats c
       JOIN products p ON c.product_id = p.id
       JOIN users u_buyer ON c.buyer_id = u_buyer.id
       JOIN users u_seller ON c.seller_id = u_seller.id
       WHERE c.buyer_id = $1 OR c.seller_id = $1
       ORDER BY last_message_at DESC NULLS LAST`,
      [userId]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get messages for a chat
exports.getChatMessages = async (req, res) => {
  try {
    const { chatId } = req.params;
    const result = await pool.query(
      "SELECT * FROM messages WHERE chat_id = $1 ORDER BY created_at ASC",
      [chatId]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Send message
exports.sendMessage = async (req, res) => {
  try {
    const { chat_id, sender_id, message, type = 'text', metadata = {} } = req.body;

    const safetyService = require("../services/safetyService");

    if (type === 'text' && message) {
      if (safetyService.isUnsafeText(message)) {
        return res.status(400).json({ 
          error: "Safety Alert: Sharing personal contact or location details is restricted. To ensure your funds are protected by our 48h Inspection Escrow, please keep all communication and transactions within the platform." 
        });
      }
    }

    if (type === 'image' && message) {
      // If it's an image, perform OCR check
      const safetyResult = await safetyService.isUnsafeImage(message);
      if (!safetyResult.safe) {
        return res.status(400).json({ 
          error: "Safety Alert: This image contains restricted contact information. For your security, all evidence and deals must be processed through the platform to guarantee payment protection." 
        });
      }
    }

    const result = await pool.query(
      "INSERT INTO messages (chat_id, sender_id, message, type, metadata) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [chat_id, sender_id, message, type, JSON.stringify(metadata)]
    );
    
    // Notify via socket (handled in server.js or here if io is available)
    const io = req.app.get("io");
    if (io) {
      io.to(`chat_${chat_id}`).emit("newMessage", result.rows[0]);
    }

    res.status(201).json(result.rows[0]);

    // Send in-app notification to the recipient
    try {
      const chatRes = await pool.query("SELECT buyer_id, seller_id, product_id FROM chats WHERE id = $1", [chat_id]);
      if (chatRes.rows.length > 0) {
        const chat = chatRes.rows[0];
        const recipientId = (sender_id == chat.buyer_id) ? chat.seller_id : chat.buyer_id;
        
        // Only notify if recipient is defined
        if (recipientId) {
          const senderRes = await pool.query("SELECT name FROM users WHERE id = $1", [sender_id]);
          const senderName = senderRes.rows[0]?.name || "Someone";
          
          await notificationService.createNotification({
            user_id: recipientId,
            title: `New Message from ${senderName}`,
            message: message.substring(0, 50) + (message.length > 50 ? '...' : ''),
            type: 'info',
            link: `/messages?chat=${chat_id}`
          });
        }
      }
    } catch (notiErr) {
      console.error("Failed to send chat notification:", notiErr.message);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
// Mark messages as read
exports.markMessagesAsRead = async (req, res) => {
  try {
    const { chatId } = req.params;
    const { userId } = req.body;

    await pool.query(
      "UPDATE messages SET is_read = true WHERE chat_id = $1 AND sender_id != $2 AND is_read = false",
      [chatId, userId]
    );

    res.json({ message: "Messages marked as read" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getTotalUnreadCount = async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await pool.query(
      `SELECT COUNT(*) as total 
       FROM messages m
       JOIN chats c ON m.chat_id = c.id
       WHERE (c.buyer_id = $1 OR c.seller_id = $1)
         AND m.sender_id != $1
         AND m.is_read = false`,
      [userId]
    );
    res.json({ total: parseInt(result.rows[0].total || 0) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Update message (for metadata/status)
exports.updateMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { metadata } = req.body;
    const result = await pool.query(
      "UPDATE messages SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb WHERE id = $2 RETURNING *",
      [JSON.stringify(metadata), messageId]
    );

    const io = req.app.get("io");
    if (io) {
      io.to(`chat_${result.rows[0].chat_id}`).emit("messageUpdated", result.rows[0]);
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
// Upload Chat Image
exports.uploadChatImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No image file provided" });
    }
    // Cloudinary returns the full URL in path
    res.json({ filename: req.file.path });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Confirm Direct Deal (Seller confirmed verbal agreement in chat)
exports.confirmDirectDeal = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { chat_id, seller_id, final_price } = req.body;
    const authenticatedUserId = req.user.id;

    // 1. Get chat details
    const chatRes = await client.query("SELECT * FROM chats WHERE id = $1 AND seller_id = $2", [chat_id, seller_id]);
    if (chatRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(403).json({ message: "Chat not found or not authorized" });
    }
    const chat = chatRes.rows[0];

    // Ensure the authenticated user is the seller
    if (parseInt(authenticatedUserId) !== parseInt(chat.seller_id)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ message: "Only the seller can confirm a direct deal." });
    }

    // 2. Check if product is already in a deal
    const productCheck = await client.query("SELECT * FROM products WHERE id = $1 FOR UPDATE", [chat.product_id]);
    if (productCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: "Product not found" });
    }
    const product = productCheck.rows[0];
    if (product.status === 'sold' || product.status === 'under_offer') {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: "This product is already under offer or sold." });
    }

    // 3. Fetch platform settings for financial calculation
    const settingsRes = await client.query("SELECT key, value FROM platform_settings WHERE key IN ('seller_commission_rate', 'buyer_commission_rate', 'gst_rate', 'verified_seller_shipment_window', 'unverified_seller_shipment_window')");
    const settings = {};
    settingsRes.rows.forEach(r => settings[r.key] = r.value);
    
    const sellerCommissionRate = parseFloat(settings.seller_commission_rate || 5);
    const buyerCommissionRate = parseFloat(settings.buyer_commission_rate || 0);
    const gstRate = parseFloat(settings.gst_rate || 18);
    const verifiedWindow = parseInt(settings.verified_seller_shipment_window || 48);
    const unverifiedWindow = parseInt(settings.unverified_seller_shipment_window || 72);

    const buyerRes = await client.query("SELECT state FROM users WHERE id = $1", [chat.buyer_id]);
    const buyer = buyerRes.rows[0];
    const sellerRes = await client.query("SELECT state, seller_type, gst_number, is_verified FROM users WHERE id = $1", [chat.seller_id]);
    const seller = sellerRes.rows[0];



    const isVerified = seller && seller.is_verified;
    const hoursToAdd = isVerified ? verifiedWindow : unverifiedWindow;
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + hoursToAdd);

    const productPrice = parseFloat(final_price);
    const shippingFee = (product.shipping_type === 'fixed') ? parseFloat(product.shipping_fee || 0) : 0;
    
    const fin = calculateDealFinancials({ price: productPrice, shippingFee, sellerCommRate: sellerCommissionRate, buyerCommRate: buyerCommissionRate, gstRate, hasGst: !!seller.gst_number });
    const seller_commission_amount = fin.sellerCommAmt;
    const buyer_commission_amount = fin.buyerCommAmt;
    const platform_gst_amount = fin.platformGst;
    const total_platform_fee = fin.totalFee;
    const tcs_rate = fin.tcsRate;
    const tcs_amount = fin.tcsAmt;
    const seller_payout = fin.sellerPayout;

    // 4. Create the deal with full financial details
    const result = await client.query(
      `INSERT INTO product_deals (
        product_id, buyer_id, seller_id, amount, shipping_fee, shipping_type, status, expires_at,
        commission_rate, commission_amount, platform_gst_amount, total_platform_fee,
        seller_payout, seller_gst_applicable, seller_gst_number, payment_status, tcs_rate, tcs_amount,
        buyer_commission_rate, buyer_commission_amount, seller_commission_rate, seller_commission_amount
      )
       VALUES ($1, $2, $3, $4, $5, $6, 'ACCEPTED', $7, $8, $9, $10, $11, $12, $13, $14, 'PENDING', $15, $16, $17, $18, $19, $20) RETURNING *`,
      [
        chat.product_id, chat.buyer_id, chat.seller_id, productPrice, shippingFee, product.shipping_type, expiresAt,
        sellerCommissionRate, seller_commission_amount, platform_gst_amount, total_platform_fee,
        seller_payout, seller.seller_type === 'business_seller', seller.gst_number, tcs_rate, tcs_amount,
        buyerCommissionRate, buyer_commission_amount, sellerCommissionRate, seller_commission_amount
      ]
    );

    // 5. Update product status
    await client.query("UPDATE products SET status = 'under_offer' WHERE id = $1", [chat.product_id]);

    await client.query('COMMIT');

    // 6. Send a system message to the chat
    const systemMsg = await pool.query(
      "INSERT INTO messages (chat_id, sender_id, message, type, metadata) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [chat_id, seller_id, `DEAL CONFIRMED: Price set to ₹${parseFloat(final_price).toLocaleString()}. Please proceed with payment.`, 'system_deal', JSON.stringify({ deal_id: result.rows[0].id, price: final_price })]
    );

    const io = req.app.get("io");
    if (io) {
      io.to(`chat_${chat_id}`).emit("newMessage", systemMsg.rows[0]);
    }

    res.json({ message: "Deal confirmed successfully!", deal: result.rows[0] });

  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
};

exports.joinDisputeChat = async (req, res) => {
  try {
    const { chatId } = req.params;
    const adminId = req.user.id;

    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: "Only administrators can intervene in chats." });
    }

    const dealRes = await pool.query(`
      SELECT d.* FROM product_deals d
      JOIN chats c ON d.product_id = c.product_id AND d.buyer_id = c.buyer_id AND d.seller_id = c.seller_id
      WHERE c.id = $1 AND d.status = 'DISPUTED'
    `, [chatId]);

    if (dealRes.rows.length === 0) {
      return res.status(400).json({ error: "Intervention is only permitted for active disputes." });
    }

    const systemMsg = await pool.query(
      "INSERT INTO messages (chat_id, sender_id, message, type, metadata) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [chatId, adminId, "ANNOUNCEMENT: A marketplace administrator has joined this thread to assist with the dispute resolution.", "system", JSON.stringify({ is_admin: true })]
    );

    const io = req.app.get("io");
    if (io) {
      io.to(`chat_${chatId}`).emit("newMessage", systemMsg.rows[0]);
    }

    res.json({ message: "Admin joined successfully.", chat_id: chatId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
