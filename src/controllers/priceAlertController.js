const pool = require("../config/db");

exports.createAlert = async (req, res) => {
  try {
    const { product_id, target_price } = req.body;
    const user_id = req.user.id;
    const result = await pool.query(
      `INSERT INTO price_alerts (user_id, product_id, target_price)
       VALUES ($1, $2, $3) ON CONFLICT (user_id, product_id)
       DO UPDATE SET target_price = $3, is_active = true, triggered = false
       RETURNING *`,
      [user_id, product_id, target_price]
    );
    res.status(201).json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.getAlerts = async (req, res) => {
  try {
    const { user_id } = req.params;
    const result = await pool.query(
      `SELECT pa.*, p.title, p.price, p.images[0] as image_url
       FROM price_alerts pa
       JOIN products p ON p.id = pa.product_id
       WHERE pa.user_id = $1
       ORDER BY pa.created_at DESC`,
      [user_id]
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.deleteAlert = async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query("DELETE FROM price_alerts WHERE id = $1", [id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.toggleAlert = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `UPDATE price_alerts SET is_active = NOT is_active WHERE id = $1 RETURNING *`,
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Alert not found" });
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.checkAndNotify = async (productId, newPrice) => {
  const alerts = await pool.query(
    "SELECT * FROM price_alerts WHERE product_id = $1 AND is_active = true AND triggered = false AND target_price >= $2",
    [productId, newPrice]
  );
  for (const alert of alerts.rows) {
    await pool.query(
      `INSERT INTO notifications (user_id, type, title, message, related_id)
       VALUES ($1, 'price_drop', 'Price Drop Alert!',
       $2, $3)`,
      [alert.user_id, `The item you're watching dropped to $${newPrice}`, productId]
    );
    await pool.query("UPDATE price_alerts SET triggered = true WHERE id = $1", [alert.id]);
  }
};
