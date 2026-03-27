require("dotenv").config();
const pool = require("./src/config/db");

async function migrate() {
  try {
    console.log("Adding expires_at to product_offers...");
    await pool.query(`
      ALTER TABLE product_offers 
      ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITHOUT TIME ZONE;
    `);
    
    // Set default expiry for existing pending offers (e.g., 48h from now)
    const fortyEightHoursFromNow = new Date();
    fortyEightHoursFromNow.setHours(fortyEightHoursFromNow.getHours() + 48);
    
    await pool.query(`
      UPDATE product_offers 
      SET expires_at = $1 
      WHERE expires_at IS NULL AND status = 'pending';
    `, [fortyEightHoursFromNow]);

    console.log("Migration complete.");
  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    process.exit();
  }
}

migrate();
