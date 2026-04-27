require('dotenv').config();
const { Pool } = require('pg');

// ── Local PostgreSQL ─────────────────────────────────────────────
const localPool = new Pool({
    user:     process.env.DB_USER     || 'postgres',
    host:     process.env.DB_HOST     || 'localhost',
    database: process.env.DB_NAME     || 'watch_marketplace',
    password: String(process.env.DB_PASSWORD || '400102'),
    port:     Number(process.env.DB_PORT) || 5432,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
});

// ── Supabase (Session Mode - port 5432) ─────────────────────────
const supabaseUrl = process.env.DATABASE_URL
    .replace('?pgbouncer=true', '')
    .replace(':6543/', ':5432/');

if (!supabaseUrl) {
    console.error('❌ No Supabase URL found. Set DATABASE_URL in .env');
    process.exit(1);
}

const remotePool = new Pool({
    connectionString: supabaseUrl,
    ssl: { rejectUnauthorized: false },
    max: 5,
    connectionTimeoutMillis: 15000,
    idleTimeoutMillis: 30000,
    statement_timeout: 60000,
});

// ── Table migration order (respects foreign key dependencies) ────
const TABLE_ORDER = [
    'users',
    'categories',
    'category_specs',
    'condition_templates',
    'products',
    'orders',
    'bids',
    'watchlist',
    'product_views',
    'product_offers',
    'product_deals',
    'chats',
    'messages',
    'reviews',
    'notifications',
    'visitor_logs',
    'banners',
    'platform_settings',
    'ui_labels',
    'quick_replies',
    'security_logs',
    'admin_audit_logs',
    'reports',
    'shipments',
    'payments',
    'seller_verification',
    'user_addresses',
    'watch_vault',
    'product_images',
    'auction_results',
];

const BATCH_SIZE = 50; // Insert 50 rows at a time

async function resetSequence(table, client) {
    try {
        await client.query(
            `SELECT setval('${table}_id_seq', COALESCE((SELECT MAX(id) FROM ${table}), 0) + 1)`
        );
    } catch (e) {
        // No sequence on this table (e.g. platform_settings uses key PK)
    }
}

async function migrateTable(table) {
    const client = await remotePool.connect();
    try {
        // Check table exists in Supabase
        const check = await client.query(
            `SELECT to_regclass('public.${table}') as exists`
        );
        if (!check.rows[0].exists) {
            console.log(`   ⚠️  ${table}: table not in Supabase yet (run schema first)`);
            return;
        }

        // Fetch local data
        const { rows } = await localPool.query(`SELECT * FROM ${table}`);
        if (rows.length === 0) {
            console.log(`   ⚪ ${table}: empty, skipped`);
            return;
        }

        const columns = Object.keys(rows[0]);
        let inserted = 0;
        let skipped = 0;

        // Disable RLS for this session so migration inserts work
        await client.query('SET session_replication_role = replica');

        // Insert in batches
        for (let i = 0; i < rows.length; i += BATCH_SIZE) {
            const batch = rows.slice(i, i + BATCH_SIZE);
            const valueSets = [];
            const flatValues = [];
            let paramIndex = 1;

            for (const row of batch) {
                const placeholders = columns.map(() => `$${paramIndex++}`).join(', ');
                valueSets.push(`(${placeholders})`);
                for (const col of columns) {
                    const val = row[col];
                    if (val !== null && typeof val === 'object') {
                        flatValues.push(JSON.stringify(val));
                    } else {
                        flatValues.push(val);
                    }
                }
            }

            const insertSql = `
                INSERT INTO ${table} (${columns.join(', ')})
                VALUES ${valueSets.join(', ')}
                ON CONFLICT DO NOTHING
            `;

            try {
                await client.query(insertSql, flatValues);
                inserted += batch.length;
            } catch (batchErr) {
                // Batch failed — try row by row to isolate bad rows
                for (const row of batch) {
                    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
                    const singleSql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;
                    const values = columns.map(col => {
                        const val = row[col];
                        return val !== null && typeof val === 'object' ? JSON.stringify(val) : val;
                    });
                    try {
                        await client.query(singleSql, values);
                        inserted++;
                    } catch (rowErr) {
                        console.log(`      ⚠️  row ${row.id || '?'} skipped: ${rowErr.message}`);
                        skipped++;
                    }
                }
            }

            process.stdout.write(`\r   ⏳ ${table}: ${inserted}/${rows.length} rows...`);
        }

        // Reset RLS
        await client.query('SET session_replication_role = DEFAULT');
        console.log(`\r   ✅ ${table}: ${inserted} rows migrated${skipped ? `, ${skipped} skipped` : ''}`);

    } catch (err) {
        if (err.message.includes('does not exist')) {
            console.log(`   ⚠️  ${table}: table not in Supabase yet (run schema first)`);
        } else {
            console.error(`\n   ❌ ${table}: ${err.message}`);
        }
    } finally {
        client.release();
    }
}

async function run() {
    console.log('\n🚀 Starting migration: Local PostgreSQL → Supabase\n');
    console.log(`📡 Supabase URL: ${supabaseUrl.replace(/:([^@]+)@/, ':****@')}\n`);

    // Test connections
    try {
        await localPool.query('SELECT 1');
        console.log('✅ Local PostgreSQL connected\n');
    } catch (e) {
        console.error('❌ Cannot connect to local PostgreSQL:', e.message);
        process.exit(1);
    }

    try {
        await remotePool.query('SELECT 1');
        console.log('✅ Supabase connected\n');
    } catch (e) {
        console.error('❌ Cannot connect to Supabase:', e.message);
        console.error('   → Check your DATABASE_URL and make sure Supabase is not paused');
        process.exit(1);
    }

    console.log('📦 Migrating tables...\n');

    for (const table of TABLE_ORDER) {
        await migrateTable(table);
    }

    // Reset all sequences
    console.log('\n🔄 Resetting sequences...');
    const client = await remotePool.connect();
    for (const table of TABLE_ORDER) {
        await resetSequence(table, client);
    }
    client.release();

    console.log('\n✨ Migration complete! Supabase DB now has all local data.');
    console.log('   Both local dev and live site now use Supabase only.\n');

    await localPool.end();
    await remotePool.end();
}

run().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
