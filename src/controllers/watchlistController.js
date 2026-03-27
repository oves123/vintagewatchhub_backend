const pool = require("../config/db");

exports.addToWatchlist = async (req, res) => {
  try {
    const { user_id, product_id } = req.body;
    const result = await pool.query(
      "INSERT INTO watchlist (user_id, product_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING *",
      [user_id, product_id]
    );
    res.json({ message: "Added to watchlist", item: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.removeFromWatchlist = async (req, res) => {
  try {
    const { user_id, product_id } = req.body;
    await pool.query(
      "DELETE FROM watchlist WHERE user_id = $1 AND product_id = $2",
      [user_id, product_id]
    );
    res.json({ message: "Removed from watchlist" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getWatchlist = async (req, res) => {
  try {
    const { user_id } = req.params;
    const result = await pool.query(
      `SELECT watchlist.*, products.title, products.price, products.image, products.auction_end
       FROM watchlist
       JOIN products ON watchlist.product_id = products.id
       WHERE watchlist.user_id = $1`,
      [user_id]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
