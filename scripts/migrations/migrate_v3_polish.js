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
        console.log("Starting Production Polish Migration...");

        // 1. Update product_deals status constraint to include new resolution states
        // We need to drop and recreate the constraint because 'DEAL_STATUS' is not a native PG enum (if it was, we'd alter type)
        // Since we used a CHECK constraint in migrate_v2.js, we drop it.
        await pool.query(`
            ALTER TABLE product_deals 
            DROP CONSTRAINT IF EXISTS product_deals_status_check;
        `);

        await pool.query(`
            ALTER TABLE product_deals 
            ADD CONSTRAINT product_deals_status_check 
            CHECK (status IN ('ACCEPTED', 'SHIPPED', 'DELIVERED', 'CONFIRMED', 'CANCELLED', 'DISPUTED', 'DISPUTE_RESOLVED_SELLER', 'DISPUTE_RESOLVED_BUYER'));
        `);

        // 2. Add buyer_confirmed_at and seller_delivered_at for precision
        await pool.query(`
            ALTER TABLE product_deals 
            ADD COLUMN IF NOT EXISTS buyer_confirmed_at TIMESTAMP,
            ADD COLUMN IF NOT EXISTS seller_delivered_at TIMESTAMP;
        `);

        // 3. Create security_logs table for suspicious activity (PII bypass attempts)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS security_logs (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                type VARCHAR(50) NOT NULL, -- 'PII_BYPASS', 'SUSPICIOUS_CONTENT'
                content TEXT,
                metadata JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log("Migration completed successfully.");
        process.exit(0);
    } catch (err) {
        console.error("Migration failed:", err);
        process.exit(1);
    }
}

migrate();
