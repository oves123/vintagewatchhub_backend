require('dotenv').config();
const pool = require('./src/config/db');

async function migrateAdmin() {
    try {
        console.log("Starting admin infrastructure migration...");
        
        // 1. Audit Logs Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS admin_audit_logs (
                id SERIAL PRIMARY KEY,
                admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                action VARCHAR(255) NOT NULL,
                target_type VARCHAR(50), -- 'user', 'product', 'setting'
                target_id INTEGER,
                details TEXT,
                ip_address VARCHAR(45),
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
        console.log("Verified admin_audit_logs table.");

        // 2. Site Settings Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS platform_settings (
                key VARCHAR(100) PRIMARY KEY,
                value TEXT,
                updated_by INTEGER REFERENCES users(id),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `);
        console.log("Verified platform_settings table.");

        // Default settings
        const defaultSettings = [
            ['maintenance_mode', 'false'],
            ['transaction_fee_percent', '5.0'],
            ['platform_name', 'WatchCollectorHUB']
        ];

        for (const [key, val] of defaultSettings) {
            await pool.query(
                "INSERT INTO platform_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING",
                [key, val]
            );
        }
        console.log("Initialized default platform settings.");

        console.log("Admin migration completed successfully.");
        process.exit(0);
    } catch (err) {
        console.error("Admin migration failed:", err.message);
        process.exit(1);
    }
}

migrateAdmin();
