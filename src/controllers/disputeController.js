const pool = require("../config/db");

exports.createDispute = async (req, res) => {
  try {
    const { deal_id, reason, description } = req.body;
    const opened_by = req.user.id;
    const existing = await pool.query("SELECT id FROM disputes WHERE deal_id = $1 AND status NOT IN ('resolved_buyer','resolved_seller','cancelled')", [deal_id]);
    if (existing.rows.length > 0) return res.status(400).json({ error: "A dispute already exists for this deal" });

    const result = await pool.query(
      `INSERT INTO disputes (deal_id, opened_by, reason, description) VALUES ($1,$2,$3,$4) RETURNING *`,
      [deal_id, opened_by, reason, description]
    );
    await pool.query("UPDATE product_deals SET has_dispute = true WHERE id = $1", [deal_id]);
    res.status(201).json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.getDisputeByDeal = async (req, res) => {
  try {
    const { deal_id } = req.params;
    const result = await pool.query(
      `SELECT d.*, u.name as opened_by_name
       FROM disputes d JOIN users u ON u.id = d.opened_by
       WHERE d.deal_id = $1 ORDER BY d.created_at DESC`,
      [deal_id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "No dispute found" });
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.getDisputeById = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT d.*, u.name as opened_by_name FROM disputes d JOIN users u ON u.id = d.opened_by WHERE d.id = $1`,
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Dispute not found" });
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.listDisputes = async (req, res) => {
  try {
    const { status } = req.query;
    let query = `SELECT d.*, u.name as opened_by_name, pd.status as deal_status
                 FROM disputes d JOIN users u ON u.id = d.opened_by
                 LEFT JOIN product_deals pd ON pd.id = d.deal_id`;
    const params = [];
    if (status) {
      query += " WHERE d.status = $1";
      params.push(status);
    }
    query += " ORDER BY d.created_at DESC";
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.addEvidence = async (req, res) => {
  try {
    const { id } = req.params;
    const { evidence_url } = req.body;
    const dispute = await pool.query("SELECT * FROM disputes WHERE id = $1", [id]);
    if (dispute.rows.length === 0) return res.status(404).json({ error: "Dispute not found" });
    const existingEvidence = dispute.rows[0].evidence_urls || [];
    const updated = [...existingEvidence, evidence_url];
    const result = await pool.query(
      "UPDATE disputes SET description = description || $1 WHERE id = $2 RETURNING *",
      [`\nEvidence: ${evidence_url}`, id]
    );
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.resolveDispute = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, resolution_notes, admin_id } = req.body;
    const result = await pool.query(
      `UPDATE disputes SET status = $1, resolution_notes = $2, admin_id = $3, resolved_at = NOW()
       WHERE id = $4 RETURNING *`,
      [status, resolution_notes, admin_id, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Dispute not found" });
    const dispute = result.rows[0];
    if (status === 'cancelled') {
      await pool.query("UPDATE product_deals SET has_dispute = false WHERE id = $1", [dispute.deal_id]);
    }
    res.json(dispute);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
