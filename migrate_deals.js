const pool = require("./src/config/db");

async function migrate() {
  try {
    await pool.query(`
      ALTER TABLE product_deals 
      ADD COLUMN IF NOT EXISTS payment_status CHARACTER VARYING DEFAULT 'PENDING',
      ADD COLUMN IF NOT EXISTS payment_method CHARACTER VARYING;
    `);
    console.log("Migration successful: Added payment_status and payment_method to product_deals.");
    process.exit(0);
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  }
}

migrate();
