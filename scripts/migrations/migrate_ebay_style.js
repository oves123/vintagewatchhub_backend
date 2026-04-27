require("dotenv").config();
const pool = require("./src/config/db");

async function migrate() {
  try {
    console.log("Starting eBay-style listing options migration...");

    await pool.query(`
      -- Add new listing option columns to products table
      ALTER TABLE products ADD COLUMN IF NOT EXISTS allow_buy_now BOOLEAN DEFAULT FALSE;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS allow_auction BOOLEAN DEFAULT FALSE;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS starting_bid NUMERIC DEFAULT 0;

      -- Ensure allow_offers exists
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='allow_offers') THEN
          ALTER TABLE products ADD COLUMN allow_offers BOOLEAN DEFAULT FALSE;
        END IF;
      END $$;

      -- buy_it_now_price already exists in some schemas, ensure it's there
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='buy_it_now_price') THEN
          ALTER TABLE products ADD COLUMN buy_it_now_price NUMERIC;
        END IF;
      END $$;

      -- auction_end already exists in some schemas (as auction_end), ensure it's there
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='auction_end') THEN
          ALTER TABLE products ADD COLUMN auction_end TIMESTAMP WITHOUT TIME ZONE;
        END IF;
      END $$;
    `);

    console.log("Migration completed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

migrate();
