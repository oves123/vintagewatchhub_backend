require('dotenv').config();
const pool = require('./src/config/db');

async function check() {
  try {
    // Check what columns exist
    const cols = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'categories' ORDER BY ordinal_position
    `);
    console.log('\nColumns:', cols.rows.map(r => r.column_name).join(', '));

    const res = await pool.query('SELECT * FROM categories ORDER BY parent_id NULLS FIRST, name');
    console.log('\n=== All Categories ===');
    res.rows.forEach(r => {
      if (!r.parent_id) {
        console.log(`[SUPER] id=${r.id} "${r.name}"`);
      } else {
        console.log(`  [sub]  id=${r.id} parent=${r.parent_id} "${r.name}"`);
      }
    });
    console.log(`\nTotal: ${res.rows.length}`);
  } catch(e) {
    console.error(e.message);
  } finally {
    pool.end();
  }
}
check();
