require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');

const remoteUrl = process.argv[2] || process.env.DATABASE_URL;

if (!remoteUrl) {
    console.error("Error: No remote database URL provided.");
    process.exit(1);
}

const remotePool = new Pool({
    connectionString: remoteUrl,
    ssl: { rejectUnauthorized: false }
});

async function applySchema() {
    try {
        console.log("📄 Reading schema_dump.sql...");
        const sql = fs.readFileSync('schema_dump.sql', 'utf8');
        
        console.log("🚀 Applying schema to remote database (individual statements)...");
        
        // Very basic split by semicolon, not perfect but should work for this dump
        const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0);
        
        let successCount = 0;
        let skipCount = 0;
        let errorCount = 0;

        for (const statement of statements) {
            try {
                await remotePool.query(statement);
                successCount++;
            } catch (err) {
                if (err.message.includes("already exists")) {
                    skipCount++;
                } else {
                    console.error(`❌ Error in statement: ${statement.substring(0, 50)}...`);
                    console.error(`   ${err.message}`);
                    errorCount++;
                }
            }
        }
        
        console.log(`✅ Finished! Success: ${successCount}, Skipped (exists): ${skipCount}, Errors: ${errorCount}`);
        process.exit(0);
    } catch (err) {
        console.error("❌ Fatal error:");
        console.error(err.message);
        process.exit(1);
    }
}

applySchema();
