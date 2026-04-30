require("dotenv").config({ path: "backend/.env" });
const pool = require("../../src/config/db");

async function fixReviewsFK() {
  const client = await pool.connect();
  try {
    console.log("Starting reviews foreign key fix...");
    await client.query("BEGIN");

    // 1. Drop the existing foreign key constraint that points to the 'orders' table
    // We use a try-catch block inside SQL or just IF EXISTS if supported for constraints (Postgres 12+)
    await client.query(`
      ALTER TABLE reviews 
      DROP CONSTRAINT IF EXISTS reviews_order_id_fkey;
    `);

    // 2. Add a new foreign key constraint that points to 'product_deals'
    // First, we need to ensure the column type matches. product_deals.id is serial/int.
    // reviews.order_id should already be int.
    
    // We'll also add a column for product_id if it's useful, but for now let's just fix the FK.
    await client.query(`
      ALTER TABLE reviews
      ADD CONSTRAINT reviews_order_id_fkey 
      FOREIGN KEY (order_id) 
      REFERENCES product_deals(id) 
      ON DELETE SET NULL;
    `);

    console.log("Successfully updated reviews foreign key to point to product_deals.");

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

fixReviewsFK();
