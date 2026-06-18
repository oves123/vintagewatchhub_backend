require('dotenv').config();
const pool = require('./src/config/db');

async function alterTable() {
  try {
    await pool.query(`
      ALTER TABLE product_deals 
      ADD COLUMN IF NOT EXISTS shipped_to_hub_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS hub_received_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS authenticated_at TIMESTAMP;
    `);
    console.log("Successfully added Hub Authentication columns to product_deals.");
  } catch (err) {
    console.error("Error altering table:", err);
  } finally {
    process.exit(0);
  }
}

alterTable();
