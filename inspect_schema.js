const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: String(process.env.DB_PASSWORD),
  port: process.env.DB_PORT
});

async function checkSchema() {
  try {
    const chatsCols = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'chats'");
    console.log("Chats Columns:", JSON.stringify(chatsCols.rows, null, 2));

    const msgCols = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'messages'");
    console.log("Messages Columns:", JSON.stringify(msgCols.rows, null, 2));

  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await pool.end();
  }
}

checkSchema();
