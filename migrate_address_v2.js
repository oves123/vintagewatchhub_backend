require("dotenv").config();
const pool = require("./src/config/db");

async function migrate() {
  const client = await pool.connect();
  try {
    console.log("Starting address refactoring migration...");
    await client.query("BEGIN");

    // Add city, state, pincode columns if they don't exist
    await client.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS city TEXT,
      ADD COLUMN IF NOT EXISTS state TEXT,
      ADD COLUMN IF NOT EXISTS pincode TEXT;
    `);

    console.log("Successfully added city, state, and pincode columns to users table.");

    await client.query("COMMIT");
    console.log("Migration completed successfully.");
    process.exit(0);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Migration failed:", error);
    process.exit(1);
  } finally {
    client.release();
  }
}

migrate();
