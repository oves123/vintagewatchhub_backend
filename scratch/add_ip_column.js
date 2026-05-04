const { Pool } = require('pg');
require('dotenv').config({ path: './.env' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/watch_marketplace'
});

async function migrate() {
  try {
    await pool.query('ALTER TABLE product_views ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45)');
    console.log('Column ip_address added successfully to product_views');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await pool.end();
  }
}

migrate();
