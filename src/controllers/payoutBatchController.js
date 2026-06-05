const pool = require("../config/db");

exports.batchRelease = async (req, res) => {
  try {
    const { payout_ids, released_by } = req.body;
    if (!payout_ids || !Array.isArray(payout_ids) || payout_ids.length === 0) {
      return res.status(400).json({ error: "payout_ids array is required" });
    }
    const results = [];
    const errors = [];
    for (const id of payout_ids) {
      try {
        const payout = await pool.query(
          "UPDATE escrow_payments SET status = 'released', released_at = NOW(), released_by = $1 WHERE id = $2 AND status = 'held' RETURNING *",
          [released_by, id]
        );
        if (payout.rows.length > 0) {
          results.push(payout.rows[0]);
        } else {
          errors.push({ id, error: "Payout not found or already released" });
        }
      } catch (e) {
        errors.push({ id, error: e.message });
      }
    }
    res.json({ released: results.length, failed: errors.length, payouts: results, errors });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.getPendingPayouts = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ep.*, u.name as seller_name, pd.title as deal_title
       FROM escrow_payments ep
       JOIN users u ON u.id = ep.seller_id
       LEFT JOIN product_deals pd ON pd.id = ep.deal_id
       WHERE ep.status = 'held'
       ORDER BY ep.created_at ASC`
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
