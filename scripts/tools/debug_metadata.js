const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: String(process.env.DB_PASSWORD),
  port: process.env.DB_PORT
});

async function checkDetails() {
  try {
    const msg = await pool.query("SELECT * FROM messages");
    console.log("All Messages:", JSON.stringify(msg.rows, null, 2));

    const settings = await pool.query("SELECT * FROM platform_settings");
    console.log("Platform Settings:", JSON.stringify(settings.rows, null, 2));

    const audit = await pool.query("SELECT * FROM admin_audit_logs ORDER BY created_at DESC LIMIT 10");
    console.log("Recent Audit Logs:", JSON.stringify(audit.rows, null, 2));

  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await pool.end();
  }
}

checkDetails();
