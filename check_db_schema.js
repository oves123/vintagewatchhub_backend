const pool = require("./src/config/db");

async function checkSchema() {
  try {
    const tables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    console.log("Tables:", tables.rows.map(r => r.table_name));

    for (const table of tables.rows) {
      const columns = await pool.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = $1
      `, [table.table_name]);
      console.log(`\nColumns for ${table.table_name}:`);
      console.log(columns.rows.map(c => `${c.column_name} (${c.data_type})`).join(", "));
    }
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkSchema();
