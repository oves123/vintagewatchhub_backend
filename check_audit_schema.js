require("dotenv").config();
const pool = require("./src/config/db");

async function checkSchema() {
  try {
    const tables = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';");
    console.log("Tables:", tables.rows.map(r => r.table_name));

    const offersCols = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'offers';");
    console.log("Offers columns:", offersCols.rows);

    const ordersCols = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'orders';");
    console.log("Orders columns:", ordersCols.rows);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}

checkSchema();
