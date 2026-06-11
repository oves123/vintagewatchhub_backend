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
          "UPDATE product_deals SET payout_status = 'RELEASED', escrow_status = 'RELEASED', payout_released_at = NOW() WHERE id = $1 AND payout_status = 'PENDING' RETURNING id, seller_id, seller_payout as amount",
          [id]
        );
        if (payout.rows.length > 0) {
          results.push(payout.rows[0]);
        } else {
          errors.push({ id, error: "Deal payout not found or already released" });
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
      `SELECT pd.id, pd.seller_id, pd.seller_payout as amount, pd.payout_status as status, 
              u.name as seller_name, p.title as deal_title, pd.created_at
       FROM product_deals pd
       JOIN users u ON u.id = pd.seller_id
       JOIN products p ON p.id = pd.product_id
       WHERE pd.payout_status = 'PENDING'
       ORDER BY pd.created_at ASC`
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
