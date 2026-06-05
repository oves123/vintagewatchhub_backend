const pool = require("../config/db");

exports.submitDocument = async (req, res) => {
  try {
    const { document_type, document_url } = req.body;
    const user_id = req.user.id;
    const result = await pool.query(
      `INSERT INTO seller_verification (user_id, document_type, document_url)
       VALUES ($1, $2, $3) RETURNING *`,
      [user_id, document_type, document_url]
    );
    res.status(201).json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.getVerificationStatus = async (req, res) => {
  try {
    const { user_id } = req.params;
    const result = await pool.query(
      "SELECT * FROM seller_verification WHERE user_id = $1 ORDER BY submitted_at DESC",
      [user_id]
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.listAllVerifications = async (req, res) => {
  try {
    const { status } = req.query;
    let query = `SELECT sv.*, u.name as user_name, u.email
                 FROM seller_verification sv JOIN users u ON u.id = sv.user_id`;
    const params = [];
    if (status) {
      query += " WHERE sv.status = $1";
      params.push(status);
    }
    query += " ORDER BY sv.submitted_at DESC";
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.reviewDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, admin_notes, reviewed_by } = req.body;
    const result = await pool.query(
      `UPDATE seller_verification SET status = $1, admin_notes = $2, reviewed_by = $3, reviewed_at = NOW()
       WHERE id = $4 RETURNING *`,
      [status, admin_notes, reviewed_by, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Verification record not found" });

    if (status === 'approved') {
      await pool.query("UPDATE users SET is_verified_seller = true WHERE id = (SELECT user_id FROM seller_verification WHERE id = $1)", [id]);
    }
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
