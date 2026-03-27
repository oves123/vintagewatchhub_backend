require("dotenv").config();
const pool = require("./src/config/db");

async function migrateDeals() {
  try {
    console.log("Starting 'product_deals' schema migration...");

    // 1. Create product_deals table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS product_deals (
        id SERIAL PRIMARY KEY,
        product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
        seller_id INTEGER REFERENCES users(id),
        buyer_id INTEGER REFERENCES users(id),
        offer_id INTEGER REFERENCES product_offers(id),
        amount NUMERIC NOT NULL,
        status VARCHAR(50) DEFAULT 'accepted', -- accepted, sold, confirmed, disputed, expired
        tracking_number VARCHAR(100),
        expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("Successfully created product_deals table.");

    // 2. Add composite index for performance and to help prevent multiple active deals easily
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_product_deals_product_status ON product_deals(product_id, status);
    `);
    
    console.log("Migration completed successfully.");
  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    process.exit();
  }
}

migrateDeals();
