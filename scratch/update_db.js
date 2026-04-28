const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function updateDatabase() {
  const client = await pool.connect();
  try {
    console.log("Starting database updates...");

    // 1. Update Products Table
    console.log("Updating products table...");
    await client.query(`
      ALTER TABLE products 
      ADD COLUMN IF NOT EXISTS reserve_price DECIMAL(12, 2) DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS current_bid DECIMAL(12, 2) DEFAULT NULL;
    `);

    // 2. Update Users Table
    console.log("Updating users table...");
    await client.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS seller_type VARCHAR(50) DEFAULT 'individual',
      ADD COLUMN IF NOT EXISTS gst_number VARCHAR(50) DEFAULT NULL;
    `);

    // 3. Create Bid History Table (if it doesn't exist)
    // Note: The controller uses 'bids'. We will ensure it exists and has necessary columns.
    console.log("Ensuring bids table exists...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS bids (
        id SERIAL PRIMARY KEY,
        product_id INTEGER REFERENCES products(id),
        user_id INTEGER REFERENCES users(id),
        bid_amount DECIMAL(12, 2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 4. Update Orders Table Status Type (if it's an enum or check constraint)
    // For now, we'll just assume it's a VARCHAR and add a comment about the new statuses.
    // Statuses: "Paid", "Shipped", "In 48h Inspection", "Completed"
    console.log("Database updates completed successfully!");
  } catch (err) {
    console.error("Error updating database:", err);
  } finally {
    client.release();
    await pool.end();
  }
}

updateDatabase();
