require('dotenv').config();
const pool = require('./src/config/db');

async function migrateNotifications() {
  try {
    console.log("Updating notifications table schema...");

    // Add missing columns if they don't exist
    await pool.query(`
      ALTER TABLE notifications 
      ADD COLUMN IF NOT EXISTS type VARCHAR(20) DEFAULT 'info',
      ADD COLUMN IF NOT EXISTS title VARCHAR(255),
      ADD COLUMN IF NOT EXISTS link VARCHAR(255);
    `);

    // Ensure is_read has a default value
    await pool.query(`
      ALTER TABLE notifications 
      ALTER COLUMN is_read SET DEFAULT false;
    `);

    console.log("Notifications table updated successfully.");
    process.exit(0);
  } catch (err) {
    console.error("Migration failed:", err.message);
    process.exit(1);
  }
}

migrateNotifications();
