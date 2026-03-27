const pool = require('./src/config/db');

async function runMigration() {
  console.log('Starting Marketplace Improvements DB Migration...');

  try {
    // 1. Add columns to orders for the buyer-confirm-sale flow
    console.log('Adding columns to orders table...');
    await pool.query(`
      ALTER TABLE orders 
      ADD COLUMN IF NOT EXISTS seller_confirmed_sold BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS buyer_confirmed_sale BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS sale_status VARCHAR(50) DEFAULT 'processing'
    `);
    console.log('Orders table updated successfully.');

    // 2. Create reports table for the complaint system
    console.log('Creating reports table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reports (
        id SERIAL PRIMARY KEY,
        reporter_id INT REFERENCES users(id) ON DELETE SET NULL,
        reported_user_id INT REFERENCES users(id) ON DELETE CASCADE,
        product_id INT REFERENCES products(id) ON DELETE SET NULL,
        reason VARCHAR(100) NOT NULL,
        description TEXT,
        status VARCHAR(20) DEFAULT 'pending',
        admin_notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        resolved_at TIMESTAMPTZ
      )
    `);
    console.log('Reports table created successfully.');

    console.log('Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
