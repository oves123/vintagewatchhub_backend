const pool = require("../config/db");

exports.createCoupon = async (req, res) => {
  try {
    const { code, type, value, min_cart_value, max_uses, expires_at } = req.body;
    const result = await pool.query(
      `INSERT INTO coupons (code, type, value, min_cart_value, max_uses, expires_at, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [code.toUpperCase(), type, value, min_cart_value || 0, max_uses || null, expires_at || null, req.user?.id || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: "Coupon code already exists" });
    res.status(500).json({ error: e.message });
  }
};

exports.listCoupons = async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM coupons ORDER BY created_at DESC");
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.updateCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active, max_uses, expires_at } = req.body;
    const result = await pool.query(
      "UPDATE coupons SET is_active = COALESCE($1, is_active), max_uses = COALESCE($2, max_uses), expires_at = COALESCE($3, expires_at) WHERE id = $4 RETURNING *",
      [is_active, max_uses, expires_at, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Coupon not found" });
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.deleteCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query("DELETE FROM coupons WHERE id = $1", [id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.validateCoupon = async (req, res) => {
  try {
    const { code, cart_value, user_id } = req.body;
    const result = await pool.query(
      "SELECT * FROM coupons WHERE code = $1 AND is_active = true AND (max_uses IS NULL OR used_count < max_uses) AND (expires_at IS NULL OR expires_at > NOW())",
      [code.toUpperCase()]
    );
    if (result.rows.length === 0) return res.status(400).json({ error: "Invalid or expired coupon" });

    const coupon = result.rows[0];
    if (parseFloat(cart_value) < parseFloat(coupon.min_cart_value)) {
      return res.status(400).json({ error: `Minimum cart value of $${coupon.min_cart_value} required` });
    }

    let discount = coupon.type === 'percentage'
      ? (parseFloat(cart_value) * parseFloat(coupon.value)) / 100
      : parseFloat(coupon.value);

    if (discount > parseFloat(cart_value)) discount = parseFloat(cart_value);

    res.json({ valid: true, discount, coupon_id: coupon.id, code: coupon.code });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.applyCouponToDeal = async (req, res) => {
  try {
    const { deal_id, coupon_id, discount_amount } = req.body;
    const user_id = req.user.id;
    await pool.query(
      "INSERT INTO coupon_usage (coupon_id, user_id, deal_id, discount_amount) VALUES ($1,$2,$3,$4)",
      [coupon_id, user_id, deal_id, discount_amount]
    );
    await pool.query("UPDATE coupons SET used_count = used_count + 1 WHERE id = $1", [coupon_id]);
    await pool.query("UPDATE product_deals SET discount_applied = $1 WHERE id = $2", [discount_amount, deal_id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
