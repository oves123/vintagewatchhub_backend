require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

async function migrate() {
    try {
        console.log("Starting Shipping Fields Migration...");

        // Add shipping_fee and shipping_type to products table
        await pool.query(`
            ALTER TABLE products 
            ADD COLUMN IF NOT EXISTS shipping_fee NUMERIC DEFAULT 0,
            ADD COLUMN IF NOT EXISTS shipping_type VARCHAR(50) DEFAULT 'fixed';
        `);

        console.log("Migration completed successfully.");
        process.exit(0);
    } catch (err) {
        console.error("Migration failed:", err);
        process.exit(1);
    }
}

migrate();
