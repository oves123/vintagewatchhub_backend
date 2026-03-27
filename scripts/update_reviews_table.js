require("dotenv").config();
const path = require("path");
const pool = require("../src/config/db");

async function updateReviewsTable() {
  try {
    console.log("Updating reviews table schema...");
    
    // Add seller_id if not exists
    await pool.query(`
      ALTER TABLE reviews 
      ADD COLUMN IF NOT EXISTS seller_id INTEGER REFERENCES users(id),
      ADD COLUMN IF NOT EXISTS order_id INTEGER REFERENCES orders(id)
    `);

    // Optional: Migrate existing data if needed (if any reviews exist with product_id)
    // We can't easily map product_id to seller_id without more context if the products are gone,
    // but usually products table is there.
    
    /*
    await pool.query(`
      UPDATE reviews r
      SET seller_id = p.seller_id
      FROM products p
      WHERE r.product_id = p.id AND r.seller_id IS NULL
    `);
    */

    console.log("Reviews table updated successfully.");
    process.exit(0);
  } catch (err) {
    console.error("Failed to update reviews table:", err.message);
    process.exit(1);
  }
}

updateReviewsTable();
