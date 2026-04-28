const { Pool } = require('pg');
require('dotenv').config({ path: '../.env' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function checkColumns() {
  try {
    const res = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'products'");
    console.log(res.rows.map(r => r.column_name));
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

checkColumns();
