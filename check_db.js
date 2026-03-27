const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: String(process.env.DB_PASSWORD),
  port: process.env.DB_PORT
});

async function checkDb() {
  try {
    const users = await pool.query("SELECT COUNT(*) FROM users");
    const products = await pool.query("SELECT COUNT(*) FROM products");
    const orders = await pool.query("SELECT COUNT(*) FROM orders");
    const watchlist = await pool.query("SELECT COUNT(*) FROM watchlist");
    
    console.log("Database Stats:");
    console.log("Users:", users.rows[0].count);
    console.log("Products:", products.rows[0].count);
    console.log("Orders:", orders.rows[0].count);
    console.log("Watchlist Items:", watchlist.rows[0].count);
    
    if (parseInt(products.rows[0].count) > 0) {
      const productSample = await pool.query("SELECT * FROM products LIMIT 1");
      console.log("Sample Product Status:", productSample.rows[0].status);
    }
  } catch (err) {
    console.error("Database connection error:", err.message);
  } finally {
    await pool.end();
  }
}

checkDb();
