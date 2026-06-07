require('dotenv').config();
const pool = require('./src/config/db');
(async () => {
  try {
    const q = `SELECT DISTINCT ON (watchlist.product_id) watchlist.*, products.title, products.price, products.images, products.product_type, products.auction_end,
              wf.name as folder_name, wf.id as folder_id
       FROM watchlist
       JOIN products ON watchlist.product_id = products.id
       LEFT JOIN watchlist_folders wf ON wf.id = watchlist.folder_id
       WHERE watchlist.user_id = $1
       ORDER BY watchlist.product_id`;
    const result = await pool.query(q, [1]);
    console.log('Result:', result.rows);
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
})();
