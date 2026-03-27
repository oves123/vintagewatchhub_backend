require("dotenv").config();
const pool = require("./src/config/db");

async function addTrackingNumberColumn() {
  const client = await pool.connect();
  try {
    console.log("Starting tracking number schema migration...");
    await client.query("BEGIN");

    // Add tracking_number column to orders if it doesn't exist
    await client.query(`
      ALTER TABLE orders 
      ADD COLUMN IF NOT EXISTS tracking_number VARCHAR(100);
    `);

    console.log("Successfully added tracking_number column to orders table.");

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

addTrackingNumberColumn();
