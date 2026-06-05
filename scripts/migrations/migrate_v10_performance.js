const { Pool } = require("pg");
require("dotenv").config({ path: require("path").join(__dirname, "../../.env") });

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Products
    await client.query("CREATE INDEX IF NOT EXISTS idx_products_status_price ON products(status, price)");
    await client.query("CREATE INDEX IF NOT EXISTS idx_products_seller_status ON products(seller_id, status)");
    await client.query("CREATE INDEX IF NOT EXISTS idx_products_created_at ON products(created_at DESC)");
    await client.query("CREATE INDEX IF NOT EXISTS idx_products_category_status ON products(category_id, status)");
    await client.query("CREATE INDEX IF NOT EXISTS idx_products_product_type ON products(product_type)");
    await client.query("CREATE INDEX IF NOT EXISTS idx_products_featured ON products(is_featured) WHERE is_featured = true");

    // Users
    await client.query("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)");
    await client.query("CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)");

    // Product Deals
    await client.query("CREATE INDEX IF NOT EXISTS idx_deals_buyer ON product_deals(buyer_id, status)");
    await client.query("CREATE INDEX IF NOT EXISTS idx_deals_seller ON product_deals(seller_id, status)");
    await client.query("CREATE INDEX IF NOT EXISTS idx_deals_status ON product_deals(status)");
    await client.query("CREATE INDEX IF NOT EXISTS idx_deals_created ON product_deals(created_at DESC)");

    // Watchlist
    await client.query("CREATE INDEX IF NOT EXISTS idx_watchlist_user ON watchlist(user_id)");
    await client.query("CREATE UNIQUE INDEX IF NOT EXISTS idx_watchlist_user_product ON watchlist(user_id, product_id)");

    // Messages
    await client.query("CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, created_at ASC)");
    await client.query("CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages(chat_id, sender_id, is_read) WHERE is_read = false");

    // Bids
    await client.query("CREATE INDEX IF NOT EXISTS idx_bids_product ON bids(product_id, created_at DESC)");

    // Offers
    await client.query("CREATE INDEX IF NOT EXISTS idx_offers_buyer ON product_offers(buyer_id)");
    await client.query("CREATE INDEX IF NOT EXISTS idx_offers_seller ON product_offers(seller_id)");

    // Product Views
    await client.query("CREATE INDEX IF NOT EXISTS idx_views_product ON product_views(product_id)");

    // Notifications
    await client.query("CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read)");

    await client.query("COMMIT");
    console.log("Migration v10 complete: 18 performance indexes created.");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("Migration failed:", e);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
