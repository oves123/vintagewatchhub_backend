require("dotenv").config();
const pool = require("./src/config/db");

async function checkSchema() {
  try {
    const usersTable = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'users'
    `);
    console.log("Users Table Columns:");
    console.table(usersTable.rows);

    const notificationsTable = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'notifications'
    `);
    console.log("Notifications Table Columns:");
    console.table(notificationsTable.rows);

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkSchema();
