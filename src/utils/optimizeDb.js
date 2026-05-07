require("dotenv").config();
const pool = require("../config/db");

async function addIndexes() {
  const client = await pool.connect();
  try {
    console.log("🚀 Starting database indexing optimization...");
    await client.query('BEGIN');

    // 1. Products table indexes
    console.log(" - Indexing products table...");
    await client.query("CREATE INDEX IF NOT EXISTS idx_products_status ON products(status)");
    await client.query("CREATE INDEX IF NOT EXISTS idx_products_seller_id ON products(seller_id)");
    await client.query("CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id)");
    await client.query("CREATE INDEX IF NOT EXISTS idx_products_created_at ON products(created_at DESC)");

    // 2. Product Deals indexes
    console.log(" - Indexing product_deals table...");
    await client.query("CREATE INDEX IF NOT EXISTS idx_deals_status ON product_deals(status)");
    await client.query("CREATE INDEX IF NOT EXISTS idx_deals_buyer_id ON product_deals(buyer_id)");
    await client.query("CREATE INDEX IF NOT EXISTS idx_deals_seller_id ON product_deals(seller_id)");
    await client.query("CREATE INDEX IF NOT EXISTS idx_deals_created_at ON product_deals(created_at DESC)");

    // 3. Product Offers indexes
    console.log(" - Indexing product_offers table...");
    await client.query("CREATE INDEX IF NOT EXISTS idx_offers_status ON product_offers(status)");
    await client.query("CREATE INDEX IF NOT EXISTS idx_offers_buyer_id ON product_offers(buyer_id)");
    await client.query("CREATE INDEX IF NOT EXISTS idx_offers_product_id ON product_offers(product_id)");

    // 4. Bids indexes
    console.log(" - Indexing bids table...");
    await client.query("CREATE INDEX IF NOT EXISTS idx_bids_product_id ON bids(product_id)");
    await client.query("CREATE INDEX IF NOT EXISTS idx_bids_user_id ON bids(user_id)");

    // 5. Watchlist indexes
    console.log(" - Indexing watchlist table...");
    await client.query("CREATE INDEX IF NOT EXISTS idx_watchlist_user_id ON watchlist(user_id)");
    await client.query("CREATE INDEX IF NOT EXISTS idx_watchlist_product_id ON watchlist(product_id)");

    // 6. Message/Chat indexes
    console.log(" - Indexing chats and messages...");
    await client.query("CREATE INDEX IF NOT EXISTS idx_chats_product_id ON chats(product_id)");
    await client.query("CREATE INDEX IF NOT EXISTS idx_chats_buyer_id ON chats(buyer_id)");
    await client.query("CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id)");
    await client.query("CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at)");

    await client.query('COMMIT');
    console.log("✅ All indexes created successfully. Marketplace performance optimized.");
  } catch (error) {
    await client.query('ROLLBACK');
    console.error("❌ Indexing failed:", error.message);
  } finally {
    client.release();
    process.exit();
  }
}

addIndexes();
