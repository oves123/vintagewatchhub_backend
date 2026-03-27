const { Pool } = require("pg");

const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "watch_marketplace",
  password: "400102",
  port: 5432
});

async function checkSchema() {
  try {
    console.log("Listing all tables in the database...");
    const tables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    console.log("Tables found:", tables.rows.map(r => r.table_name).join(", "));

    for (const table of tables.rows) {
      console.log(`\nChecking columns for ${table.table_name}...`);
      const columns = await pool.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = $1
      `, [table.table_name]);
      console.log(`${table.table_name} columns:`, columns.rows.map(r => `${r.column_name} (${r.data_type})`).join(", "));
    }

    process.exit(0);
  } catch (err) {
    console.error("Schema check failed:", err.message);
    process.exit(1);
  }
}

checkSchema();
