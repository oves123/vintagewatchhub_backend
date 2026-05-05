require("dotenv").config();
const pool = require("../../src/config/db");

async function migrate() {
  try {
    console.log("Starting payment visibility migration...");

    // Add razorpay columns to product_deals
    await pool.query(`
      ALTER TABLE product_deals 
      ADD COLUMN IF NOT EXISTS razorpay_order_id TEXT,
      ADD COLUMN IF NOT EXISTS razorpay_payment_id TEXT;
    `);
    console.log("✅ Added razorpay_order_id and razorpay_payment_id to product_deals.");

    console.log("Migration completed successfully!");
    process.exit(0);
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  }
}

migrate();
