require('dotenv').config();
const pool = require('./src/config/db');

async function testSync() {
    const testId = `test_${Date.now()}`;
    const userAgent = `Antigravity Dual-DB Tester (${testId})`;

    console.log(`🚀 Testing Dual-Write Sync...`);
    console.log(`📝 Inserting record into 'visitor_logs' table...`);

    try {
        // --- Test 1: Plain SQL String ---
        console.log(`\n--- Test 1: Plain SQL String ---`);
        await pool.query(
            "INSERT INTO visitor_logs (ip_address, user_agent) VALUES ($1, $2)",
            ['127.0.0.1', userAgent]
        );
        console.log(`✅ String query sent.`);

        // --- Test 2: Query Object ---
        console.log(`\n--- Test 2: Query Object ---`);
        const queryObj = {
            text: "INSERT INTO visitor_logs (ip_address, user_agent) VALUES ($1, $2)",
            values: ['127.0.0.1', `${userAgent} [OBJECT]`]
        };
        await pool.query(queryObj);
        console.log(`✅ Object query sent.`);

        console.log(`\n⏳ Waiting 3 seconds for background sync to complete...`);
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Verify Test 1
        console.log(`🔍 Checking results for Test 1...`);
        const local1 = await pool.localPool.query("SELECT id FROM visitor_logs WHERE user_agent = $1", [userAgent]);
        const remote1 = await pool.supabasePool.query("SELECT id FROM visitor_logs WHERE user_agent = $1", [userAgent]);
        console.log(`   Local: ${local1.rows.length > 0 ? '✅' : '❌'} | Supabase: ${remote1.rows.length > 0 ? '✅' : '❌'}`);

        // Verify Test 2
        console.log(`🔍 Checking results for Test 2...`);
        const local2 = await pool.localPool.query("SELECT id FROM visitor_logs WHERE user_agent = $1", [`${userAgent} [OBJECT]`]);
        const remote2 = await pool.supabasePool.query("SELECT id FROM visitor_logs WHERE user_agent = $1", [`${userAgent} [OBJECT]`]);
        console.log(`   Local: ${local2.rows.length > 0 ? '✅' : '❌'} | Supabase: ${remote2.rows.length > 0 ? '✅' : '❌'}`);

        // Cleanup
        console.log(`\n🧹 Cleaning up test records...`);
        await pool.query("DELETE FROM visitor_logs WHERE user_agent LIKE $1", [`%${testId}%`]);
        
        console.log(`\n✨ Test finished.`);
        process.exit(0);
    } catch (err) {
        console.error(`\n❌ Test failed:`, err.message);
        process.exit(1);
    }
}

testSync();
