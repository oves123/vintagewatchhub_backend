require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

async function checkProducts() {
  try {
    const res = await pool.query("SELECT id, title, item_specifics FROM products LIMIT 10");
    console.log("Ten Recent Products:");
    res.rows.forEach(p => {
      console.log(`ID: ${p.id} | Title: ${p.title} | Specs: ${JSON.stringify(p.item_specifics)}`);
    });
    
    const brands = await pool.query("SELECT DISTINCT item_specifics->>'brand' as brand FROM products WHERE item_specifics->>'brand' IS NOT NULL");
    console.log("\nDistinct Brands in DB (item_specifics):", brands.rows.map(r => r.brand));
    
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkProducts();
