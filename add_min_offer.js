require('dotenv').config();
const pool = require('./src/config/db.js');
async function run() {
  try {
    await pool.query("ALTER TABLE products ADD COLUMN minimum_offer_amount NUMERIC(10, 2) DEFAULT NULL;");
    console.log("Added minimum_offer_amount to products");
  } catch (err) {
    if (err.code === '42701') console.log("Column already exists");
    else console.error(err);
  } finally {
    pool.end();
  }
}
run();
