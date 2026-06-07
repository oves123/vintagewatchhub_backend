require('dotenv').config();
const pool = require('./src/config/db');
(async () => {
  try {
    const res = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'watchlist';
    `);
    console.log(res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
})();
