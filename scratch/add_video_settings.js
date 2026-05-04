const { Pool } = require('pg');
require('dotenv').config({ path: './.env' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/watch_marketplace'
});

async function migrate() {
  try {
    await pool.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS video_settings JSONB DEFAULT \'{}\'::jsonb');
    console.log('Column video_settings added successfully');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await pool.end();
  }
}

migrate();
