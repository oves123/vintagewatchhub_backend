const pool = require("../config/db");

exports.createFolder = async (req, res) => {
  try {
    const { name } = req.body;
    const user_id = req.user.id;
    const result = await pool.query(
      "INSERT INTO watchlist_folders (user_id, name) VALUES ($1, $2) RETURNING *",
      [user_id, name]
    );
    res.status(201).json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.getFolders = async (req, res) => {
  try {
    const { user_id } = req.params;
    const result = await pool.query(
      "SELECT * FROM watchlist_folders WHERE user_id = $1 ORDER BY created_at DESC",
      [user_id]
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.renameFolder = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    const result = await pool.query(
      "UPDATE watchlist_folders SET name = $1 WHERE id = $2 RETURNING *",
      [name, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Folder not found" });
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.deleteFolder = async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query("UPDATE watchlist SET folder_id = NULL WHERE folder_id = $1", [id]);
    await pool.query("DELETE FROM watchlist_folders WHERE id = $1", [id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
