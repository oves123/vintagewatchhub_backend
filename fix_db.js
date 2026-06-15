require('dotenv').config();
const pool = require('./src/config/db');
pool.query("UPDATE products SET status = 'sold' WHERE id IN (SELECT product_id FROM product_deals WHERE payment_status = 'PAID') AND status = 'under_offer'")
  .then(res => { console.log('Updated rows:', res.rowCount); process.exit(0); })
  .catch(err => { console.error(err); process.exit(1); });
