const { Pool } = require("pg");
require("dotenv").config({ path: require("path").join(__dirname, "../../.env") });

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  await pool.query(`
    UPDATE products SET search_vector = 
      setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
      setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
      setweight(to_tsvector('english', coalesce(item_specifics->>'brand', '')), 'A') ||
      setweight(to_tsvector('english', coalesce(item_specifics->>'model', '')), 'B') ||
      setweight(to_tsvector('english', coalesce(item_specifics->>'reference_number', '')), 'C')
    WHERE search_vector IS NULL
  `);
  const result = await pool.query("SELECT COUNT(*) as cnt FROM products WHERE search_vector IS NOT NULL");
  console.log("Updated search vectors for", result.rows[0].cnt, "products");
  await pool.end();
}

run().catch(e => { console.error(e); process.exit(1); });
