const pool = require("../config/db");
const emailService = require("./emailService");
const smsService = require("./smsService");
const whatsappService = require("./whatsappService");

/**
 * Create a new in-app notification for a user.
 * @param {Object} data - Notification data
 * @param {number} data.user_id - Recipient user ID
 * @param {string} data.title - notification title
 * @param {string} data.message - alert message
 * @param {string} [data.type='info'] - success, info, warning, error
 * @param {string} [data.link] - internal link to redirect (e.g., /admin/products)
 * @param {Array<string>} [data.channels=['in_app']] - e.g., ['in_app', 'email', 'sms', 'whatsapp']
 */
exports.createNotification = async ({ user_id, title, message, type = 'info', link = null, channels = ['in_app'] }) => {
  try {
    if (!user_id) return;
    
    if (channels.includes('in_app')) {
      const result = await pool.query(
        "INSERT INTO notifications (user_id, title, message, type, link) VALUES ($1, $2, $3, $4, $5) RETURNING *",
        [user_id, title, message, type, link]
      );

      if (global.io) {
        global.io.to(`user_${user_id}`).emit("newNotification", result.rows[0]);
      }
    }

    // Handle External Channels if requested
    if (channels.includes('email') || channels.includes('sms') || channels.includes('whatsapp')) {
      const userRes = await pool.query("SELECT email, phone FROM users WHERE id = $1", [user_id]);
      const user = userRes.rows[0];

      if (user) {
        if (channels.includes('email') && user.email) {
          // Fire and forget so we don't block
          emailService.sendEmail({
            to: user.email,
            subject: title,
            html: `<h3>${title}</h3><p>${message}</p><p><a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}${link || ''}">View Details</a></p>`
          }).catch(console.error);
        }

        if (channels.includes('sms') && user.phone) {
          smsService.sendSMS({
            to: user.phone,
            body: `Vintage Marketplace: ${title}\n${message}`
          }).catch(console.error);
        }

        if (channels.includes('whatsapp') && user.phone) {
          whatsappService.sendWhatsApp({
            to: user.phone,
            body: `*Vintage Marketplace*\n*${title}*\n\n${message}`
          }).catch(console.error);
        }
      }
    }

    return true;
  } catch (error) {
    console.error("Error creating notification:", error.message);
    return false;
  }
};

/**
 * Mark a notification as read.
 */
exports.markAsRead = async (id, user_id) => {
  try {
    await pool.query(
      "UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2",
      [id, user_id]
    );
    return true;
  } catch (error) {
    console.error("Error marking notification as read:", error.message);
    return false;
  }
};

/**
 * Get user notifications.
 */
exports.getUserNotifications = async (user_id, limit = 20) => {
  try {
    const result = await pool.query(
      "SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2",
      [user_id, limit]
    );
    return result.rows;
  } catch (error) {
    console.error("Error fetching notifications:", error.message);
    return [];
  }
};

/**
 * Get all admin user IDs.
 */
exports.getAdminIds = async () => {
  try {
    const result = await pool.query("SELECT id FROM users WHERE role = 'admin'");
    return result.rows.map(r => r.id);
  } catch (error) {
    console.error("Error fetching admin IDs:", error.message);
    return [];
  }
};
