require('dotenv').config();
const pool = require('./src/config/db');

async function fixSchema() {
    try {
        console.log("Starting schema fix...");
        
        // Add is_active to users
        await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE');
        console.log("Verified is_active column in users table.");

        // Create visitor_logs table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS visitor_logs (
                id SERIAL PRIMARY KEY,
                ip_address VARCHAR(45),
                user_agent TEXT,
                visited_at TIMESTAMP DEFAULT NOW()
            )
        `);
        console.log("Verified visitor_logs table exists.");

        // Create watchlist table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS watchlist (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
                UNIQUE(user_id, product_id)
            )
        `);
        console.log("Verified watchlist table exists.");

        console.log("Schema fix completed successfully.");
        process.exit(0);
    } catch (err) {
        console.error("Schema fix failed:", err.message);
        process.exit(1);
    }
}

fixSchema();
