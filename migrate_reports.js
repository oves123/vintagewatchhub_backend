require('dotenv').config();
const pool = require('./src/config/db');

async function migrateReports() {
    try {
        console.log("Starting reports table migration...");
        
        // Use a transaction to ensure atomic execution
        await pool.query('BEGIN');
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS reports (
                id SERIAL PRIMARY KEY,
                reporter_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                reported_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
                reason VARCHAR(100) NOT NULL,
                description TEXT,
                status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'resolved', 'dismissed', 'warned', 'banned'
                admin_notes TEXT,
                created_at TIMESTAMP DEFAULT NOW(),
                resolved_at TIMESTAMP
            )
        `);
        
        await pool.query('COMMIT');
        
        console.log("Reports table verified/created successfully.");
        process.exit(0);
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error("Reports migration failed:", err.message);
        process.exit(1);
    }
}

migrateReports();
