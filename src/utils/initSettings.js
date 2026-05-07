require("dotenv").config();
const pool = require("../config/db");

async function initSettings() {
  try {
    console.log("🛠️ Initializing Platform Settings...");

    // 1. Ensure table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS platform_settings (
        key VARCHAR(100) PRIMARY KEY,
        value VARCHAR(255) NOT NULL,
        updated_by INTEGER,
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // 2. Insert default GST and Commission rates if they don't exist
    const settings = [
      { key: 'gst_rate', value: '18' },
      { key: 'seller_commission_rate', value: '5' },
      { key: 'buyer_commission_rate', value: '0' }
    ];

    for (const setting of settings) {
      await pool.query(`
        INSERT INTO platform_settings (key, value)
        VALUES ($1, $2)
        ON CONFLICT (key) DO NOTHING
      `, [setting.key, setting.value]);
    }

    console.log("✅ Platform settings initialized successfully.");
    process.exit(0);
  } catch (err) {
    console.error("❌ Initialization failed:", err);
    process.exit(1);
  }
}

initSettings();
