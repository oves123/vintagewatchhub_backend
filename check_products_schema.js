require("dotenv").config();
const pool = require("./src/config/db");

async function checkProductsSchema() {
  try {
    const res = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'products';");
    console.log(res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}

checkProductsSchema();
