const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres.wevuqkzmkisnalfjnwhm:oves400102%40123@aws-1-ap-south-1.pooler.supabase.com:5432/postgres' });
pool.query("UPDATE products SET status='approved' WHERE id=26; DELETE FROM product_deals WHERE product_id=26;")
  .then(res => { console.log('Reset successful'); pool.end(); })
  .catch(err => { console.error(err); pool.end(); });
