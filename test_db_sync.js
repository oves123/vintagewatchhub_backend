require('dotenv').config();
const pool = require('./src/config/db');

async function testSync() {
    const testId = `test_${Date.now()}`;
    const userAgent = `Antigravity Dual-DB Tester (${testId})`;

    console.log(`🚀 Testing Dual-Write Sync...`);
    console.log(`📝 Inserting record into 'visitor_logs' table...`);

    try {
        // This should trigger a dual write because it's an INSERT
        await pool.query(
            "INSERT INTO visitor_logs (ip_address, user_agent) VALUES ($1, $2)",
            ['127.0.0.1', userAgent]
        );

        console.log(`✅ Write command sent to pool.`);
        console.log(`⏳ Waiting 2 seconds for background sync to complete...`);
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Now check Local
        console.log(`🔍 Checking LOCAL database...`);
        const localRes = await pool.localPool.query(
            "SELECT * FROM visitor_logs WHERE user_agent = $1",
            [userAgent]
        );
        console.log(localRes.rows.length > 0 ? "   ✅ Record found in Local!" : "   ❌ Record NOT found in Local.");

        // Now check Supabase
        console.log(`🔍 Checking SUPABASE database...`);
        const supabaseRes = await pool.supabasePool.query(
            "SELECT * FROM visitor_logs WHERE user_agent = $1",
            [userAgent]
        );
        console.log(supabaseRes.rows.length > 0 ? "   ✅ Record found in Supabase!" : "   ❌ Record NOT found in Supabase.");

        // Cleanup
        console.log(`🧹 Cleaning up test records...`);
        await pool.query("DELETE FROM visitor_logs WHERE user_agent = $1", [userAgent]);

        console.log(`\n✨ Test finished.`);
        process.exit(0);
    } catch (err) {
        console.error(`\n❌ Test failed:`, err.message);
        process.exit(1);
    }
}

testSync();
