require("dotenv").config();
const pool = require("./src/config/db");

async function checkProductsData() {
  try {
    const res = await pool.query("SELECT id, title, item_specifics FROM products LIMIT 5;");
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}

checkProductsData();
