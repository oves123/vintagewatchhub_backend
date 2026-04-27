require("dotenv").config();
const pool = require("./src/config/db");

async function migrate() {
  try {
    console.log("Starting production-grade schema upgrade...");

    // 1. Add reason and timestamp columns to product_deals
    await pool.query(`
      ALTER TABLE product_deals 
      ADD COLUMN IF NOT EXISTS cancel_reason TEXT,
      ADD COLUMN IF NOT EXISTS dispute_reason TEXT,
      ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP;
    `);
    console.log("- Added reason and timestamp columns to product_deals.");

    // 2. Add GIN index to products.item_specifics for performance
    // Note: We use JSONB to allow GIN indexing. If it's JSON, we might need to cast or convert.
    // Assuming it's already JSONB based on previous context.
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_products_item_specifics ON products USING GIN (item_specifics);
    `);
    console.log("- Created GIN index on products.item_specifics.");

    console.log("Migration completed successfully.");
    process.exit(0);
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  }
}

migrate();
