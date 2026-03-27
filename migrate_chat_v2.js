require("dotenv").config();
const pool = require("./src/config/db");

async function migrate() {
  try {
    console.log("Starting Chat V2 Migration...");

    // 1. Create UI Labels table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ui_labels (
        key VARCHAR(255) PRIMARY KEY,
        value TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("✓ ui_labels table created");

    // 2. Create Quick Replies table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS quick_replies (
        id SERIAL PRIMARY KEY,
        text TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("✓ quick_replies table created");

    // 3. Seed UI Labels
    const labels = [
      ['chat_sidebar_title', 'Messages'],
      ['chat_search_placeholder', 'Search or start new chat'],
      ['chat_no_conversations', 'No conversations found'],
      ['chat_active_listing_discussion', 'Active listing discussion'],
      ['chat_discussing_prefix', 'Discussing:'],
      ['chat_make_offer_btn', 'Make Offer'],
      ['chat_empty_state_title', 'Marketplace Conversations'],
      ['chat_empty_state_desc', 'Send and receive messages for your watch listings. Keep your discussions safe within the hub to remain eligible for protection protocols.'],
      ['chat_encryption_notice', 'End-to-end encrypted'],
      ['chat_type_placeholder', 'Type a message'],
      ['chat_online_status', 'Online'],
      ['chat_offline_status', 'Offline'],
      ['chat_sold_label', 'SOLD']
    ];

    for (const [key, value] of labels) {
      await pool.query(
        "INSERT INTO ui_labels (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2",
        [key, value]
      );
    }
    console.log("✓ ui_labels seeded");

    // 4. Seed Quick Replies
    const replies = [
      'Is this available?',
      'Best price?',
      'Set inspection',
      'Papers included?',
      'Original box available?',
      'Is the price negotiable?'
    ];

    await pool.query("DELETE FROM quick_replies"); // Clear existing
    for (const text of replies) {
      await pool.query("INSERT INTO quick_replies (text) VALUES ($1)", [text]);
    }
    console.log("✓ quick_replies seeded");

    console.log("Migration completed successfully!");
  } catch (err) {
    console.error("Migration failed:", err.message);
  } finally {
    process.exit();
  }
}

migrate();
