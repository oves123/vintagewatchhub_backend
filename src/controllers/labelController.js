const pool = require("../config/db");

exports.getUiLabels = async (req, res) => {
  try {
    const result = await pool.query("SELECT key, value FROM ui_labels");
    const labels = {};
    result.rows.forEach(row => {
      labels[row.key] = row.value;
    });
    res.json(labels);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getQuickReplies = async (req, res) => {
  try {
    const result = await pool.query("SELECT id, text FROM quick_replies ORDER BY id ASC");
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
