const { Pool } = require("pg");
require("dotenv").config({ path: require("path").join(__dirname, "../../.env") });

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Wishlist Folders
    await client.query(`
      CREATE TABLE IF NOT EXISTS watchlist_folders (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(`
      ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS folder_id INTEGER REFERENCES watchlist_folders(id) ON DELETE SET NULL
    `);

    // 2. Price Drop Alerts
    await client.query(`
      CREATE TABLE IF NOT EXISTS price_alerts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
        target_price NUMERIC(12,2) NOT NULL,
        is_active BOOLEAN DEFAULT true,
        triggered BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, product_id)
      )
    `);

    // 3. Disputes (dedicated table)
    await client.query(`
      CREATE TABLE IF NOT EXISTS disputes (
        id SERIAL PRIMARY KEY,
        deal_id INTEGER REFERENCES product_deals(id) ON DELETE CASCADE,
        opened_by INTEGER REFERENCES users(id),
        reason VARCHAR(100) NOT NULL,
        description TEXT,
        status VARCHAR(30) DEFAULT 'open' CHECK (status IN ('open', 'under_review', 'resolved_buyer', 'resolved_seller', 'cancelled')),
        admin_id INTEGER REFERENCES users(id),
        resolution_notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        resolved_at TIMESTAMP
      )
    `);
    await client.query(`
      ALTER TABLE product_deals ADD COLUMN IF NOT EXISTS has_dispute BOOLEAN DEFAULT false
    `);

    // 4. Coupons
    await client.query(`
      CREATE TABLE IF NOT EXISTS coupons (
        id SERIAL PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        type VARCHAR(20) NOT NULL CHECK (type IN ('percentage', 'flat')),
        value NUMERIC(12,2) NOT NULL,
        min_cart_value NUMERIC(12,2) DEFAULT 0,
        max_uses INTEGER DEFAULT NULL,
        used_count INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        expires_at TIMESTAMP,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS coupon_usage (
        id SERIAL PRIMARY KEY,
        coupon_id INTEGER REFERENCES coupons(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id),
        deal_id INTEGER REFERENCES product_deals(id),
        discount_amount NUMERIC(12,2),
        used_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // 5. Seller Verification documents
    await client.query(`
      CREATE TABLE IF NOT EXISTS seller_verification (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        document_type VARCHAR(50) NOT NULL,
        document_url TEXT NOT NULL,
        status VARCHAR(30) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
        admin_notes TEXT,
        submitted_at TIMESTAMP DEFAULT NOW(),
        reviewed_at TIMESTAMP,
        reviewed_by INTEGER REFERENCES users(id)
      )
    `);

    // 6. Featured products
    await client.query(`
      ALTER TABLE products ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT false
    `);
    await client.query(`
      ALTER TABLE products ADD COLUMN IF NOT EXISTS featured_expires_at TIMESTAMP
    `);
    await client.query(`
      ALTER TABLE products ADD COLUMN IF NOT EXISTS featured_fee_paid BOOLEAN DEFAULT false
    `);

    await client.query("COMMIT");
    console.log("Migration v8 complete: all new tables and columns created.");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("Migration failed:", e);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
