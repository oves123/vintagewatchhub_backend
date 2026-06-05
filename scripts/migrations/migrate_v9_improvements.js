const { Pool } = require("pg");
require("dotenv").config({ path: require("path").join(__dirname, "../../.env") });

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Full-text search support
    await client.query(`
      ALTER TABLE products ADD COLUMN IF NOT EXISTS search_vector tsvector
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_products_search ON products USING gin(search_vector)
    `);
    await client.query(`
      CREATE OR REPLACE FUNCTION update_product_search_vector()
      RETURNS trigger AS $$
      BEGIN
        NEW.search_vector :=
          setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
          setweight(to_tsvector('english', coalesce(NEW.description, '')), 'B') ||
          setweight(to_tsvector('english', coalesce(NEW.item_specifics->>'brand', '')), 'A') ||
          setweight(to_tsvector('english', coalesce(NEW.item_specifics->>'model', '')), 'B') ||
          setweight(to_tsvector('english', coalesce(NEW.item_specifics->>'reference_number', '')), 'C');
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await client.query(`
      DROP TRIGGER IF EXISTS trg_update_product_search ON products
    `);
    await client.query(`
      CREATE TRIGGER trg_update_product_search
      BEFORE INSERT OR UPDATE ON products
      FOR EACH ROW EXECUTE FUNCTION update_product_search_vector()
    `);

    // 2. Message delivery tracking
    await client.query(`
      ALTER TABLE messages ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP
    `);
    await client.query(`
      ALTER TABLE messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMP
    `);
    await client.query(`
      ALTER TABLE messages ADD COLUMN IF NOT EXISTS message_type VARCHAR(30) DEFAULT 'text'
    `);
    await client.query(`
      ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_id INTEGER REFERENCES messages(id) ON DELETE SET NULL
    `);

    // 3. Typing indicators table
    await client.query(`
      CREATE TABLE IF NOT EXISTS typing_indicators (
        chat_id INTEGER REFERENCES chats(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        started_at TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (chat_id, user_id)
      )
    `);

    // 4. Saved searches
    await client.query(`
      CREATE TABLE IF NOT EXISTS saved_searches (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        query_params JSONB NOT NULL,
        notify_on_new BOOLEAN DEFAULT false,
        last_notified_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // 5. Rate limiting table (for distributed rate limiting)
    await client.query(`
      CREATE TABLE IF NOT EXISTS rate_limit_log (
        id SERIAL PRIMARY KEY,
        identifier VARCHAR(255) NOT NULL,
        endpoint VARCHAR(255) NOT NULL,
        attempted_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_rate_limit_lookup ON rate_limit_log(identifier, endpoint, attempted_at)
    `);

    // 6. Cache table for performance
    await client.query(`
      CREATE TABLE IF NOT EXISTS cache_store (
        key VARCHAR(255) PRIMARY KEY,
        value JSONB NOT NULL,
        expires_at TIMESTAMP NOT NULL
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_cache_expires ON cache_store(expires_at)
    `);

    await client.query("COMMIT");
    console.log("Migration v9 complete: full-text search, messaging delivery, saved searches, rate limiting, cache.");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("Migration failed:", e);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
