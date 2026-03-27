const pool = require("../config/db");

/**
 * Create a new in-app notification for a user.
 * @param {Object} data - Notification data
 * @param {number} data.user_id - Recipient user ID
 * @param {string} data.title - notification title
 * @param {string} data.message - alert message
 * @param {string} [data.type='info'] - success, info, warning, error
 * @param {string} [data.link] - internal link to redirect (e.g., /admin/products)
 */
exports.createNotification = async ({ user_id, title, message, type = 'info', link = null }) => {
  try {
    if (!user_id) return;
    
    const result = await pool.query(
      "INSERT INTO notifications (user_id, title, message, type, link) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [user_id, title, message, type, link]
    );

    // Notify via Socket if possible
    // Note: We need to get IO from the app instance. 
    // Usually it's better to pass it or use a global emitter.
    // For now, we'll try to use a global emitter if set up.
    if (global.io) {
      global.io.to(`user_${user_id}`).emit("newNotification", result.rows[0]);
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
