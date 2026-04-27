require("dotenv").config();
const pool = require("./src/config/db");

async function checkOffersBids() {
  try {
    const productOffersCols = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'product_offers';");
    console.log("product_offers columns:", productOffersCols.rows);

    const bidsCols = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'bids';");
    console.log("Bids columns:", bidsCols.rows);

    const productsCols = await pool.query("SELECT id, title, status FROM products LIMIT 5;");
    console.log("Products status check:", productsCols.rows);

  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}

checkOffersBids();
