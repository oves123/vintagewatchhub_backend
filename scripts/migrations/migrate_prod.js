require('dotenv').config();
const { Pool } = require('pg');

// Local Connection
const localPool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'watch_marketplace',
    password: String(process.env.DB_PASSWORD || '400102'),
    port: process.env.DB_PORT || 5432,
});

// Remote Connection (Supabase)
const remoteUrl = process.argv[2] || process.env.DATABASE_URL;

if (!remoteUrl) {
    console.error("\x1b[31m%s\x1b[0m", "Error: No remote database URL provided.");
    process.exit(1);
}

const remotePool = new Pool({
    connectionString: remoteUrl,
    ssl: { rejectUnauthorized: false }
});

async function migrate() {
    try {
        console.log("\x1b[36m%s\x1b[0m", "🚀 Starting Advanced Production Migration...");
        
        const tablesRes = await localPool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_type = 'BASE TABLE'
            AND table_name NOT LIKE 'pg_%'
            AND table_name NOT LIKE 'sql_%'
        `);
        
        let tablesToMigrate = tablesRes.rows.map(r => r.table_name);
        let migratedTables = new Set();
        let attempts = 0;
        const maxAttempts = 5;

        // Try to disable constraints for the session
        try { await remotePool.query('SET session_replication_role = replica;'); } catch(e) {}

        while (tablesToMigrate.length > 0 && attempts < maxAttempts) {
            attempts++;
            console.log(`\n--- Migration Attempt ${attempts} (${tablesToMigrate.length} tables remaining) ---`);
            const remainingNext = [];

            for (const table of tablesToMigrate) {
                try {
                    console.log(`📦 Table: \x1b[35m${table}\x1b[0m`);
                    const dataRes = await localPool.query(`SELECT * FROM ${table}`);
                    if (dataRes.rows.length === 0) {
                        console.log(`   ℹ️ Empty, marking as done.`);
                        migratedTables.add(table);
                        continue;
                    }

                    const columns = Object.keys(dataRes.rows[0]);
                    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
                    
                    for (const row of dataRes.rows) {
                        const values = columns.map(col => {
                            const val = row[col];
                            if (val !== null && typeof val === 'object') return JSON.stringify(val);
                            return val;
                        });
                        const insertSql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;
                        await remotePool.query(insertSql, values);
                    }
                    console.log(`   ✅ Success!`);
                    migratedTables.add(table);
                } catch (err) {
                    if (err.code === '23503') { // Foreign Key Violation
                        console.log(`   ⏳ Dependency issue, will retry later.`);
                        remainingNext.push(table);
                    } else {
                        console.error(`   ❌ Failed: ${err.message}`);
                        // Keep it in remaining to try again or just log error
                        remainingNext.push(table);
                    }
                }
            }
            tablesToMigrate = remainingNext;
        }

        try { await remotePool.query('SET session_replication_role = DEFAULT;'); } catch(e) {}

        if (tablesToMigrate.length === 0) {
            console.log("\n\x1b[32m%s\x1b[0m", "✨ All data synchronized successfully!");
        } else {
            console.log("\n\x1b[33m%s\x1b[0m", `⚠️ Sync finished with ${tablesToMigrate.length} tables still pending dependencies.`);
        }
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

migrate();
