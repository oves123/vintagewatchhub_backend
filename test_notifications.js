require('dotenv').config();
const pool = require('./src/config/db');
const notificationService = require('./src/services/notificationService');
const http = require('http');

async function testNotifications() {
  const userId = 1; // Assuming John's ID is 1, let's check
  const userResult = await pool.query("SELECT id FROM users WHERE email = 'john@test.com'");
  if (userResult.rows.length === 0) {
    console.error("User john@test.com not found");
    process.exit(1);
  }
  const johnId = 2; // Admin user ID

  console.log(`Creating test notification for user ID ${johnId}...`);
  await notificationService.createNotification({
    user_id: johnId,
    title: "Test Alert",
    message: "This is a test notification to verify the system.",
    type: "info",
    link: "/orders"
  });

  console.log("Fetching notifications via API...");
  // Note: We need a token to fetch via API. 
  // For testing, we can just query the DB directly to see if it's there.
  const result = await pool.query("SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1", [johnId]);
  console.log("Latest Notification in DB:", result.rows[0]);

  process.exit(0);
}

testNotifications().catch(err => {
  console.error(err);
  process.exit(1);
});
