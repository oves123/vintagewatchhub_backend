const pool = require("../config/db");
const notificationService = require("../services/notificationService");

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

    // Harden Regex for Contact Info Blocking (Ruthless mode)
    const phoneRegex = /(?:\+?\d{1,3}[\s-]?)?(?:\(?\d{3}\)?[\s-]?)?\d{3}[\s-]?\d{4}/;
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
    const spacedPhoneRegex = /(\d\s*){10,12}/; // Detects "9 8 7 6 5 4 3 2 1 0"
    const socialKeywords = /\b(whatsapp|insta|telegram|t\.me|wa\.me|instagram|facebook|fb\.com|insta:)\b/i;
    const numberWordsRegex = /\b(zero|one|two|three|four|five|six|seven|eight|nine)\s+(zero|one|two|three|four|five|six|seven|eight|nine)\b/i; // Detects "nine eight"

    // Whitelist for tracking numbers (to avoid false positives)
    const trackingWhitelistRegex = /\b(AWB|TRACKING|ID|UPS|DHL|FEDEX|1Z|RR|CP)\s*[:#]?\s*[A-Z0-9]{8,25}\b/i;

    if (type === 'text' && message) {
      // If it looks like a tracking number, skip the PII block
      if (trackingWhitelistRegex.test(message)) {
        // Allow tracking numbers to pass through
      } else if (
        phoneRegex.test(message) || 
        emailRegex.test(message) ||
        (message.replace(/\s/g, '').length >= 10 && spacedPhoneRegex.test(message)) ||
        socialKeywords.test(message) ||
        numberWordsRegex.test(message)
      ) {
        return res.status(400).json({ 
          error: "Safety Alert: Sharing phone numbers, emails, or social platform links is not permitted. Please keep all communication within the platform for your security." 
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
      "SELECT SUM(unread_count) as total FROM chats WHERE buyer_id = $1 OR seller_id = $1",
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
  try {
    const { chat_id, seller_id, final_price } = req.body;

    // 1. Get chat details
    const chatRes = await pool.query("SELECT * FROM chats WHERE id = $1 AND seller_id = $2", [chat_id, seller_id]);
    if (chatRes.rows.length === 0) {
      return res.status(403).json({ message: "Chat not found or not authorized" });
    }
    const chat = chatRes.rows[0];

    // 2. Check if product is already in a deal
    const productCheck = await pool.query("SELECT status FROM products WHERE id = $1", [chat.product_id]);
    if (productCheck.rows[0].status === 'sold' || productCheck.rows[0].status === 'under_offer') {
      return res.status(400).json({ message: "This product is already under offer or sold." });
    }

    // 3. Create the deal
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 72); // Standard 72h window

    const result = await pool.query(
      `INSERT INTO product_deals (product_id, buyer_id, seller_id, amount, status, expires_at)
       VALUES ($1, $2, $3, $4, 'ACCEPTED', $5) RETURNING *`,
      [chat.product_id, chat.buyer_id, chat.seller_id, final_price, expiresAt]
    );

    // 4. Update product status
    await pool.query("UPDATE products SET status = 'under_offer' WHERE id = $1", [chat.product_id]);

    // 5. Send a system message to the chat
    const systemMsg = await pool.query(
      "INSERT INTO messages (chat_id, sender_id, message, type, metadata) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [chat_id, seller_id, `DEAL CONFIRMED: Price set to ₹${parseFloat(final_price).toLocaleString()}. Please proceed with shipment.`, 'system_deal', JSON.stringify({ deal_id: result.rows[0].id, price: final_price })]
    );

    const io = req.app.get("io");
    if (io) {
      io.to(`chat_${chat_id}`).emit("newMessage", systemMsg.rows[0]);
    }

    res.json({ message: "Deal confirmed successfully!", deal: result.rows[0] });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
