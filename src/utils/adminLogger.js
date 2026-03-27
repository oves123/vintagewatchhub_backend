const pool = require('../config/db');

/**
 * Log an administrative action to the audit logs.
 * @param {number} adminId - The ID of the admin performing the action.
 * @param {string} action - Descriptive action name (e.g., 'approve_product').
 * @param {string} targetType - Type of entity affected ('user', 'product', etc.).
 * @param {number} targetId - ID of the affected entity.
 * @param {object} details - Additional JSON data for the log.
 * @param {string} ipAddress - IP address of the admin.
 */
async function logAdminAction(adminId, action, targetType, targetId, details, ipAddress) {
    try {
        await pool.query(
            `INSERT INTO admin_audit_logs 
            (admin_id, action, target_type, target_id, details, ip_address) 
            VALUES ($1, $2, $3, $4, $5, $6)`,
            [adminId, action, targetType, targetId, JSON.stringify(details), ipAddress]
        );
    } catch (error) {
        console.error("Failed to log admin action:", error.message);
        // We don't throw here to avoid failing the main request if logging fails
    }
}

module.exports = { logAdminAction };
