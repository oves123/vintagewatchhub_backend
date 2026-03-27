const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: String(process.env.DB_PASSWORD),
  port: process.env.DB_PORT
});

async function checkChats() {
  try {
    const chats = await pool.query("SELECT * FROM chats ORDER BY id DESC LIMIT 10");
    console.log("Recent Chats:", JSON.stringify(chats.rows, null, 2));

    const messages = await pool.query("SELECT * FROM messages WHERE created_at >= '2026-03-26' ORDER BY created_at DESC LIMIT 10");
    console.log("Messages from yesterday/today:", JSON.stringify(messages.rows, null, 2));

    const chatCount = await pool.query("SELECT COUNT(*) FROM chats");
    const msgCount = await pool.query("SELECT COUNT(*) FROM messages");
    console.log(`Total Chats: ${chatCount.rows[0].count}, Total Messages: ${msgCount.rows[0].count}`);

    // Check for any labels table
    const tables = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
    console.log("Tables:", tables.rows.map(r => r.table_name).join(", "));

  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await pool.end();
  }
}

checkChats();
