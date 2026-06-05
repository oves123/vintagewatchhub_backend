const pool = require("../config/db");

exports.toggleFeatured = async (req, res) => {
  try {
    const { id } = req.params;
    const { is_featured, featured_expires_at } = req.body;
    const result = await pool.query(
      `UPDATE products SET is_featured = $1, featured_expires_at = $2
       WHERE id = $3 RETURNING *`,
      [is_featured, is_featured ? featured_expires_at : null, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Product not found" });
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.getFeaturedProducts = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM products
       WHERE is_featured = true AND (featured_expires_at IS NULL OR featured_expires_at > NOW())
       ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.setFeatured = async (req, res) => {
  try {
    const { id } = req.params;
    const { days, fee_paid } = req.body;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + (days || 7));
    const result = await pool.query(
      `UPDATE products SET is_featured = true, featured_expires_at = $1, featured_fee_paid = $2 WHERE id = $3 RETURNING *`,
      [expiresAt, fee_paid || false, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Product not found" });
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
