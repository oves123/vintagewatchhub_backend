const { Pool } = require("pg");

// ── Always use Supabase ────────────────────────────────────────────────────
// Both local dev and production connect to the same Supabase database.
// This ensures all changes (local or live) go to a single source of truth.
if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL is not set. Add it to your .env file.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Required for Supabase
  max: 10,
});

pool.on("connect", () => {
  console.log("✅ DB connected: Supabase");
});

pool.on("error", (err) => {
  console.error("❌ DB pool error:", err.message);
});

module.exports = pool;