const pool = require("../config/db");

exports.addToWatchlist = async (req, res) => {
  try {
    const user_id = req.user.id;
    const { product_id, folder_id } = req.body;
    const result = await pool.query(
      "INSERT INTO watchlist (user_id, product_id, folder_id) VALUES ($1, $2, $3) ON CONFLICT (user_id, product_id) DO UPDATE SET folder_id = $3 RETURNING *",
      [user_id, product_id, folder_id || null]
    );
    res.json({ message: "Added to watchlist", item: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.removeFromWatchlist = async (req, res) => {
  try {
    const user_id = req.user.id;
    const { product_id } = req.body;
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
    const requesterId = req.user.id;
    if (parseInt(user_id) !== parseInt(requesterId) && req.user.role !== 'admin') {
      return res.status(403).json({ message: "Access denied." });
    }
    const result = await pool.query(
      `SELECT DISTINCT ON (watchlist.product_id) watchlist.*, products.title, products.price, products.images, products.product_type, products.auction_end,
              wf.name as folder_name, wf.id as folder_id
       FROM watchlist
       JOIN products ON watchlist.product_id = products.id
       LEFT JOIN watchlist_folders wf ON wf.id = watchlist.folder_id
       WHERE watchlist.user_id = $1
       ORDER BY watchlist.product_id`,
      [user_id]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
