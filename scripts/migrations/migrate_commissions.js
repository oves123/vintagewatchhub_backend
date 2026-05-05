require("dotenv").config();
const pool = require("../../src/config/db");

async function migrate() {
  try {
    console.log("Starting commission settings migration...");

    // 1. Add new columns to product_deals
    await pool.query(`
      ALTER TABLE product_deals 
      ADD COLUMN IF NOT EXISTS buyer_commission_rate NUMERIC DEFAULT 0,
      ADD COLUMN IF NOT EXISTS buyer_commission_amount NUMERIC DEFAULT 0,
      ADD COLUMN IF NOT EXISTS seller_commission_rate NUMERIC DEFAULT 5,
      ADD COLUMN IF NOT EXISTS seller_commission_amount NUMERIC DEFAULT 0;
    `);
    console.log("✅ Added buyer_commission_rate, buyer_commission_amount, seller_commission_rate, seller_commission_amount to product_deals.");

    // 2. Add settings to platform_settings
    await pool.query(`
      INSERT INTO platform_settings (key, value) 
      VALUES 
        ('buyer_commission_rate', '0'),
        ('seller_commission_rate', '5')
      ON CONFLICT (key) DO NOTHING;
    `);
    console.log("✅ Seeded buyer_commission_rate and seller_commission_rate into platform_settings.");

    console.log("Migration completed successfully!");
    process.exit(0);
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  }
}

migrate();
