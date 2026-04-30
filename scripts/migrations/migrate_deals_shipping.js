require("dotenv").config({ path: "backend/.env" });
const pool = require("../../src/config/db");

async function migrateDealsShipping() {
  const client = await pool.connect();
  try {
    console.log("Starting product_deals shipping columns migration...");
    await client.query("BEGIN");

    // Add shipping related columns to product_deals
    await client.query(`
      ALTER TABLE product_deals 
      ADD COLUMN IF NOT EXISTS courier_name VARCHAR(255),
      ADD COLUMN IF NOT EXISTS tracking_number VARCHAR(100),
      ADD COLUMN IF NOT EXISTS packing_video TEXT,
      ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS seller_delivered_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS buyer_confirmed_at TIMESTAMP;
    `);

    console.log("Successfully added shipping columns to product_deals table.");

    await client.query("COMMIT");
    console.log("Migration completed successfully.");
    process.exit(0);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Migration failed:", error);
    process.exit(1);
  } finally {
    client.release();
  }
}

migrateDealsShipping();
