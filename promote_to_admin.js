const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: String(process.env.DB_PASSWORD),
  port: process.env.DB_PORT
});

async function promoteToAdmin() {
  try {
    const email = "oveskhan890@gmail.com";
    const result = await pool.query(
      "UPDATE users SET role = 'admin' WHERE email = $1 RETURNING id, name, email, role",
      [email]
    );
    
    if (result.rows.length === 0) {
      console.log(`User ${email} not found.`);
    } else {
      console.log("User successfully promoted to admin:", result.rows[0]);
    }
  } catch (err) {
    console.error("Error promoting user to admin:", err.message);
  } finally {
    await pool.end();
  }
}

promoteToAdmin();
