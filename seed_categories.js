require('dotenv').config();
const pool = require('./src/config/db');

// Map existing super-categories to their sub-categories
const subCategories = {
  'Accessories': [
    'Straps & Bracelets',
    'Watch Boxes & Cases',
    'Watch Winders',
    'Display Stands',
    'Pouches & Rolls',
    'Cleaning Kits',
  ],
  'New Watches': [
    'Automatic',
    'Manual Wind',
    'Quartz',
    'Chronographs',
    'Dive Watches',
    'Dress Watches',
    'Smartwatches',
    'Limited Editions',
  ],
  'Pre-Owned Watches': [
    'Vintage (pre-1990)',
    'Neo-Vintage (1990-2010)',
    'Modern Pre-Owned',
    'Pocket Watches',
    'Military Watches',
    'Trench Watches',
  ],
  'Tools & Parts': [
    'Movements',
    'Dials',
    'Hands & Bezels',
    'Crystals',
    'Watchmaker Tools',
    'Crowns & Pushers',
  ],
  'Watch Lots': [
    'Job Lots',
    'Collector Collections',
    'Estate Sales',
    'Restoration Projects',
  ],
};

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get existing super-categories
    const superRes = await client.query("SELECT id, name FROM categories WHERE parent_id IS NULL");
    const superMap = {};
    superRes.rows.forEach(r => { superMap[r.name] = r.id; });

    console.log('Found super-categories:', Object.keys(superMap));

    let inserted = 0;
    for (const [superName, subs] of Object.entries(subCategories)) {
      const parentId = superMap[superName];
      if (!parentId) {
        console.log(`⚠️  Super-category "${superName}" not found — skipping`);
        continue;
      }
      for (const subName of subs) {
        // Check if already exists
        const exists = await client.query('SELECT id FROM categories WHERE name = $1', [subName]);
        if (exists.rows.length > 0) {
          // Update parent_id if missing
          await client.query('UPDATE categories SET parent_id = $1 WHERE name = $2 AND parent_id IS NULL', [parentId, subName]);
          console.log(`  ↻ Already exists: "${subName}" (ensured parent_id=${parentId})`);
        } else {
          const ins = await client.query(
            'INSERT INTO categories (name, parent_id) VALUES ($1, $2) RETURNING id',
            [subName, parentId]
          );
          console.log(`  + Added: "${subName}" under "${superName}" (id=${ins.rows[0].id})`);
          inserted++;
        }
      }
    }

    await client.query('COMMIT');
    console.log(`\n✅ Done! Inserted ${inserted} new sub-categories.`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Failed:', err.message);
  } finally {
    client.release();
    pool.end();
  }
}

seed();
