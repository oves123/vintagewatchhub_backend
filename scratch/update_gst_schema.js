const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Update users table
    await client.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS pan_number VARCHAR(50),
      ADD COLUMN IF NOT EXISTS gst_enrolment_id VARCHAR(50);
    `);
    
    // Update products table
    await client.query(`
      ALTER TABLE products 
      ADD COLUMN IF NOT EXISTS shipping_scope VARCHAR(20) DEFAULT 'LOCAL';
    `);
    
    // Update product_deals table
    await client.query(`
      ALTER TABLE product_deals 
      ADD COLUMN IF NOT EXISTS tcs_rate DECIMAL(5, 2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS tcs_amount DECIMAL(10, 2) DEFAULT 0;
    `);

    await client.query('COMMIT');
    console.log('GST & Shipping Schema Migration successful');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
