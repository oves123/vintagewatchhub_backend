const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function runMigration() {
  console.log("Running security feature migrations...");
  try {
    // 1. Update product_deals for escrow tracking
    await pool.query(`
      ALTER TABLE product_deals 
      ADD COLUMN IF NOT EXISTS escrow_status VARCHAR(50) DEFAULT 'NONE'
    `);
    
    // 2. Update users for 2FA tracking
    await pool.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS two_fa_secret VARCHAR(255),
      ADD COLUMN IF NOT EXISTS two_fa_enabled BOOLEAN DEFAULT FALSE
    `);

    // 3. Update products for serial tracking
    await pool.query(`
      ALTER TABLE products 
      ADD COLUMN IF NOT EXISTS serial_number VARCHAR(100)
    `);

    console.log("Migration successful!");
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    pool.end();
  }
}

runMigration();
