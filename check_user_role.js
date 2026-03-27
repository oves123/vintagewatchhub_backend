const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: String(process.env.DB_PASSWORD),
  port: process.env.DB_PORT
});

async function checkUserRole() {
  try {
    const email = "oveskhan890@gmail.com";
    const result = await pool.query("SELECT id, name, email, role FROM users WHERE email = $1", [email]);
    
    if (result.rows.length === 0) {
      console.log(`User ${email} not found.`);
    } else {
      console.log("User details:", result.rows[0]);
    }
  } catch (err) {
    console.error("Error checking user role:", err.message);
  } finally {
    await pool.end();
  }
}

checkUserRole();
