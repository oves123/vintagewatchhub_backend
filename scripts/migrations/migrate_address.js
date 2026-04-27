require("dotenv").config();
const pool = require("./src/config/db");

async function addAddressColumn() {
  const client = await pool.connect();
  try {
    console.log("Starting user address schema migration...");
    await client.query("BEGIN");

    // Add address column to users if it doesn't exist
    await client.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS address TEXT;
    `);

    console.log("Successfully added address column to users table.");

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

addAddressColumn();
