require('dotenv').config();
const pool = require('./src/config/db');

async function run() {
  try {
    await pool.query("ALTER TABLE product_deals ADD COLUMN IF NOT EXISTS packing_video VARCHAR(255);");
    console.log("Successfully added packing_video column");
  } catch (err) {
    console.error("Error:", err);
  } finally {
    process.exit();
  }
}

run();
