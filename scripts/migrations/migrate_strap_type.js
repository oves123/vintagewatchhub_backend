require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

async function migrate() {
    try {
        console.log("Starting Strap Type Migration...");

        // 1. Get Category IDs
        const catRes = await pool.query("SELECT id, name FROM categories WHERE name IN ('New Watches', 'Pre-Owned Watches')");
        const catIds = catRes.rows.map(r => r.id);

        if (catIds.length === 0) {
            console.error("Error: 'New Watches' or 'Pre-Owned Watches' categories not found.");
            process.exit(1);
        }

        console.log(`Found categories: ${catRes.rows.map(r => r.name).join(', ')}`);

        // 2. Add Strap Type to condition_templates
        for (const catId of catIds) {
            await pool.query(`
                INSERT INTO condition_templates (category_id, field_name, field_label, field_type, options)
                VALUES ($1, 'strap_type', 'Strap Type', 'select', $2)
                ON CONFLICT (category_id, field_name) DO UPDATE SET 
                    field_label = EXCLUDED.field_label,
                    field_type = EXCLUDED.field_type,
                    options = EXCLUDED.options;
            `, [catId, JSON.stringify(['Metal', 'Leather', 'No Strap'])]);
        }

        console.log("Migration completed successfully.");
        process.exit(0);
    } catch (err) {
        console.error("Migration failed:", err);
        process.exit(1);
    }
}

migrate();
