const pool = require("../config/db");

// Buyer submits a complaint/report against a seller
exports.createReport = async (req, res) => {
  try {
    const { reported_user_id, product_id, reason, description } = req.body;
    const reporter_id = req.user?.id;

    if (!reporter_id) return res.status(401).json({ message: "Authentication required" });
    if (!reported_user_id || !reason) {
      return res.status(400).json({ message: "Reported user and reason are required" });
    }

    // Prevent self-reporting
    if (reporter_id === parseInt(reported_user_id)) {
      return res.status(400).json({ message: "You cannot report yourself" });
    }

    const result = await pool.query(
      `INSERT INTO reports (reporter_id, reported_user_id, product_id, reason, description, status, created_at)
       VALUES ($1, $2, $3, $4, $5, 'pending', NOW())
       RETURNING *`,
      [reporter_id, reported_user_id, product_id || null, reason, description || null]
    );

    res.status(201).json({ message: "Report submitted. Admin will review shortly.", report: result.rows[0] });
  } catch (error) {
    if (error.code === '42P01') {
      return res.status(500).json({ error: 'Reports table does not exist. Please run the migration.' });
    }
    res.status(500).json({ error: error.message });
  }
};

// Admin: get all reports with user details
exports.getReports = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT r.*,
        reporter.name AS reporter_name, reporter.email AS reporter_email,
        reported.name AS reported_name, reported.email AS reported_email,
        p.title AS product_title
      FROM reports r
      LEFT JOIN users reporter ON r.reporter_id = reporter.id
      LEFT JOIN users reported ON r.reported_user_id = reported.id
      LEFT JOIN products p ON r.product_id = p.id
      ORDER BY r.created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    if (error.code === '42P01') {
      return res.json([]); // table doesn't exist yet, return empty
    }
    res.status(500).json({ error: error.message });
  }
};

// Admin: resolve a report (warn, dismiss, or action taken)
exports.resolveReport = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, admin_notes } = req.body; // status: 'resolved', 'dismissed', 'warned', 'banned'

    const result = await pool.query(
      `UPDATE reports SET status = $1, admin_notes = $2, resolved_at = NOW() WHERE id = $3 RETURNING *`,
      [status, admin_notes || null, id]
    );

    if (result.rows.length === 0) return res.status(404).json({ message: "Report not found" });

    res.json({ message: `Report ${status}`, report: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
