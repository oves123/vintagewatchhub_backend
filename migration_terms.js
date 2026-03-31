require("dotenv").config();
const pool = require("./src/config/db");


async function migrate() {
  try {
    console.log("Starting T&C migration...");

    // 1. Add terms_accepted column to users
    await pool.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS terms_accepted BOOLEAN DEFAULT FALSE
    `);
    console.log("Column 'terms_accepted' added to 'users' table.");

    // 2. Create platform_settings table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS platform_settings (
        id SERIAL PRIMARY KEY,
        key VARCHAR(100) UNIQUE NOT NULL,
        value TEXT NOT NULL,
        updated_by INTEGER REFERENCES users(id),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log("'platform_settings' table ready.");

    // 3. Seed initial terms_and_conditions
    const initialTerms = `
# ✨ Terms and Conditions

Welcome to the Premium Watch Auction Marketplace. By using this platform, you agree to the following terms:

### 1. 📬 Subscription Model
This platform operates on a **Subscription Model** for all active traders. To list products, participate in premium auctions, or access expert hub services, a recurring subscription fee is required. Detailed tier pricing is available in your account settings.

### 2. 💎 Authenticity Guarantee
All timepieces listed are subject to hub verification. Any attempt to sell counterfeit watches will result in an immediate and permanent account suspension.

### 3. ⚖️ Fee Structure
In addition to subscriptions, a transaction fee may apply to successful sales. These fees support our authentication experts and secure logistics.

### 4. 🛡️ User Privacy
Your data is encrypted and used solely for transaction facilitation and hub support.

By checking the box and clicking "Accept & Continue", you confirm that you have read, understood, and agreed to these terms, including the **Subscription Model** and fee structures.
    `.trim();

    await pool.query(`
      INSERT INTO platform_settings (key, value)
      VALUES ('terms_and_conditions', $1)
      ON CONFLICT (key) DO NOTHING
    `, [initialTerms]);
    
    console.log("Initial Terms & Conditions seeded.");

    console.log("Migration completed successfully.");
    process.exit(0);
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  }
}

migrate();
