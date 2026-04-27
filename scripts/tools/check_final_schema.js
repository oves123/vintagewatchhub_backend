require("dotenv").config();
const pool = require("./src/config/db");

async function checkSchema() {
  try {
    console.log("--- product_offers ---");
    const resOffers = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'product_offers';");
    console.log(resOffers.rows);

    console.log("--- product_deals ---");
    const resDeals = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'product_deals';");
    console.log(resDeals.rows);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}

checkSchema();
