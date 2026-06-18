require("dotenv").config();
const pool = require('./src/config/db');

async function createBountiesTable() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS bounties (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id),
                brand VARCHAR(255) NOT NULL,
                model VARCHAR(255) NOT NULL,
                reference_number VARCHAR(255),
                year_range VARCHAR(100),
                condition_req VARCHAR(50),
                budget NUMERIC(10, 2) NOT NULL,
                status VARCHAR(50) DEFAULT 'ACTIVE',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("bounties table created/verified successfully.");
    } catch (err) {
        console.error("Error creating bounties table:", err);
    } finally {
        process.exit();
    }
}

createBountiesTable();
