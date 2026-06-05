const pool = require("../config/db");

exports.bulkCreateProducts = async (req, res) => {
  try {
    const { products, seller_id } = req.body;
    if (!products || !Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ error: "Products array is required" });
    }
    const results = [];
    const errors = [];
    for (let i = 0; i < products.length; i++) {
      const p = products[i];
      try {
        if (!p.title || !p.price || !p.category) {
          errors.push({ index: i, error: "Missing required fields (title, price, category)", product: p });
          continue;
        }
        const result = await pool.query(
          `INSERT INTO products (seller_id, title, description, price, category, condition_type, image_url, stock)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
          [seller_id, p.title, p.description || '', p.price, p.category, p.condition_type || 'fair', p.image_url || '', p.stock || 1]
        );
        results.push(result.rows[0]);
      } catch (e) {
        errors.push({ index: i, error: e.message, product: p });
      }
    }
    res.status(201).json({ created: results.length, failed: errors.length, products: results, errors });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
