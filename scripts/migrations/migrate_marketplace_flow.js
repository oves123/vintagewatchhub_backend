/**
 * migrate_marketplace_flow.js  — run from: backend/
 * node migrate_marketplace_flow.js
 */
require('dotenv').config();
const pool = require('./src/config/db');


async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log('🚀 Starting marketplace flow migration...\n');

    // 1. seller_type and gst_number on users
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS seller_type VARCHAR(30) DEFAULT 'individual_collector'`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS gst_number VARCHAR(20)`);
    console.log('✅ users: seller_type, gst_number columns added');

    // 2. commission + payout tracking on product_deals
    const dealCols = [
      `ALTER TABLE product_deals ADD COLUMN IF NOT EXISTS commission_rate NUMERIC DEFAULT 5`,
      `ALTER TABLE product_deals ADD COLUMN IF NOT EXISTS commission_amount NUMERIC DEFAULT 0`,
      `ALTER TABLE product_deals ADD COLUMN IF NOT EXISTS platform_gst_amount NUMERIC DEFAULT 0`,
      `ALTER TABLE product_deals ADD COLUMN IF NOT EXISTS total_platform_fee NUMERIC DEFAULT 0`,
      `ALTER TABLE product_deals ADD COLUMN IF NOT EXISTS platform_amount NUMERIC DEFAULT 0`,
      `ALTER TABLE product_deals ADD COLUMN IF NOT EXISTS seller_payout NUMERIC DEFAULT 0`,
      `ALTER TABLE product_deals ADD COLUMN IF NOT EXISTS payout_status VARCHAR(30) DEFAULT 'PENDING'`,
      `ALTER TABLE product_deals ADD COLUMN IF NOT EXISTS payout_released_at TIMESTAMP`,
      `ALTER TABLE product_deals ADD COLUMN IF NOT EXISTS payout_released_by INTEGER`,
      `ALTER TABLE product_deals ADD COLUMN IF NOT EXISTS seller_gst_applicable BOOLEAN DEFAULT false`,
      `ALTER TABLE product_deals ADD COLUMN IF NOT EXISTS seller_gst_number VARCHAR(20)`,
      `ALTER TABLE product_deals ADD COLUMN IF NOT EXISTS razorpay_order_id VARCHAR(100)`,
      `ALTER TABLE product_deals ADD COLUMN IF NOT EXISTS razorpay_payment_id VARCHAR(100)`,
      `ALTER TABLE product_deals ADD COLUMN IF NOT EXISTS razorpay_signature VARCHAR(255)`,
    ];
    for (const q of dealCols) await client.query(q);
    console.log('✅ product_deals: commission, payout, GST columns added');

    // 3. Seed platform_settings
    const settings = [
      ['commission_rate', '5'],
      ['gst_rate', '18'],
      ['platform_name', 'WatchCollectorHUB'],
      ['platform_gst_number', ''],
    ];
    for (const [key, value] of settings) {
      await client.query(
        `INSERT INTO platform_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`,
        [key, value]
      );
    }
    console.log('✅ platform_settings: commission_rate=5%, gst_rate=18% seeded');

    await client.query('COMMIT');
    console.log('\n🎉 Migration completed successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
