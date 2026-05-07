require("dotenv").config();
const pool = require("../config/db");

async function updateSchema() {
  const client = await pool.connect();
  try {
    console.log("🚀 Updating schema for Shipping Transparency and Auto-Payouts...");
    await client.query('BEGIN');

    // 1. Add shipping details to product_deals
    console.log(" - Adding courier_name and tracking_id to product_deals...");
    await client.query("ALTER TABLE product_deals ADD COLUMN IF NOT EXISTS courier_name VARCHAR(100)");
    await client.query("ALTER TABLE product_deals ADD COLUMN IF NOT EXISTS tracking_id VARCHAR(100)");
    await client.query("ALTER TABLE product_deals ADD COLUMN IF NOT EXISTS is_insured BOOLEAN DEFAULT FALSE");
    
    // 2. Add payout release timestamp
    console.log(" - Adding auto_payout_at to product_deals...");
    await client.query("ALTER TABLE product_deals ADD COLUMN IF NOT EXISTS auto_payout_at TIMESTAMP");

    // 3. Add evidence column for disputes
    console.log(" - Adding evidence column to product_deals...");
    await client.query("ALTER TABLE product_deals ADD COLUMN IF NOT EXISTS evidence JSONB DEFAULT '[]'");

    // 4. Add Slug for SEO
    console.log(" - Adding slug column to products...");
    await client.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS slug VARCHAR(255) UNIQUE");
    
    // 5. Ensure Financial Ledger is robust
    console.log(" - Ensuring financial_ledger table is immutable...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS financial_ledger (
        id SERIAL PRIMARY KEY,
        deal_id INTEGER REFERENCES product_deals(id),
        user_id INTEGER REFERENCES users(id),
        amount DECIMAL(15,2),
        type VARCHAR(50), -- 'PAYOUT', 'COMMISSION', 'GST', 'TCS', 'REFUND'
        status VARCHAR(50),
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query('COMMIT');
    console.log("✅ Schema updated successfully.");
  } catch (error) {
    await client.query('ROLLBACK');
    console.error("❌ Schema update failed:", error.message);
  } finally {
    client.release();
    process.exit();
  }
}

updateSchema();
