const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: String(process.env.DB_PASSWORD),
  port: process.env.DB_PORT
});

async function checkUsers() {
  try {
    const users = await pool.query("SELECT id, name, email FROM users");
    console.log("Users:", JSON.stringify(users.rows, null, 2));

  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await pool.end();
  }
}

checkUsers();
