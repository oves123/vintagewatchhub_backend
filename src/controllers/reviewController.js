const pool = require("../config/db");

exports.createReview = async (req, res) => {
  try {
    const { order_id, seller_id, rating, comment } = req.body;
    const reviewer_id = req.user.id; // From auth middleware

    if (!seller_id || !rating) {
      return res.status(400).json({ message: "Seller ID and rating are required" });
    }

    // Check if a review already exists for this order
    if (order_id) {
      const existingReview = await pool.query(
        "SELECT id FROM reviews WHERE order_id = $1 AND user_id = $2",
        [order_id, reviewer_id]
      );
      if (existingReview.rows.length > 0) {
        return res.status(400).json({ message: "You have already reviewed this transaction" });
      }
    }

    const result = await pool.query(
      `INSERT INTO reviews (user_id, seller_id, order_id, rating, comment)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [reviewer_id, seller_id, order_id, rating, comment]
    );

    // Update seller average rating
    const statsResult = await pool.query(
      "SELECT AVG(rating) as avg_rating FROM reviews WHERE seller_id = $1",
      [seller_id]
    );
    const newAvg = statsResult.rows[0].avg_rating;

    await pool.query(
      "UPDATE users SET rating = $1 WHERE id = $2",
      [newAvg, seller_id]
    );

    res.status(201).json({
      message: "Review submitted successfully",
      review: result.rows[0]
    });
  } catch (error) {
    console.error("Create Review Error:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.getSellerReviews = async (req, res) => {
  try {
    const { sellerId } = req.params;

    const result = await pool.query(
      `SELECT r.*, u.name as reviewer_name, u.profile_image as reviewer_image
       FROM reviews r
       JOIN users u ON r.user_id = u.id
       WHERE r.seller_id = $1
       ORDER BY r.created_at DESC`,
      [sellerId]
    );

    const statsResult = await pool.query(
      "SELECT AVG(rating) as average_rating, COUNT(*) as review_count FROM reviews WHERE seller_id = $1",
      [sellerId]
    );

    res.json({
      reviews: result.rows,
      stats: {
        average_rating: parseFloat(statsResult.rows[0].average_rating || 0).toFixed(1),
        review_count: parseInt(statsResult.rows[0].review_count || 0)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getUserReviews = async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await pool.query(
      `SELECT r.*, u.name as seller_name, p.title as product_title
       FROM reviews r
       JOIN users u ON r.seller_id = u.id
       LEFT JOIN product_deals d ON r.order_id = d.id
       LEFT JOIN products p ON d.product_id = p.id
       WHERE r.user_id = $1
       ORDER BY r.created_at DESC`,
      [userId]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
