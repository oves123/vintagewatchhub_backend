const { Pool } = require('pg');

const remoteUrl = "postgresql://postgres:oves400102%40123@db.wevuqkzmkisnalfjnwhm.supabase.co:5432/postgres";

const remotePool = new Pool({
    connectionString: remoteUrl,
    ssl: { rejectUnauthorized: false }
});

async function fix() {
    try {
        console.log("Fixing categories table...");
        await remotePool.query("ALTER TABLE categories ADD COLUMN IF NOT EXISTS parent_id integer");
        
        console.log("Fixing users table...");
        await remotePool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS phone character varying(20)");
        await remotePool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS bio text");
        await remotePool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_image character varying(255)");
        await remotePool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true");
        
        console.log("Adding indexes...");
        await remotePool.query("CREATE INDEX IF NOT EXISTS idx_products_status ON products(status)");
        
        console.log("Done!");
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

fix();
