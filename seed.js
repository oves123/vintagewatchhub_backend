require("dotenv").config();
const pool = require("./src/config/db");

async function seed() {
  try {
    console.log("Starting database seeding for marketplace and profile systems...");

    // 1. Create Categories Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE
      )
    `);

    // 2. Create Category Specs Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS category_specs (
        id SERIAL PRIMARY KEY,
        category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
        field_name VARCHAR(100) NOT NULL,
        field_label VARCHAR(100) NOT NULL,
        field_type VARCHAR(50) DEFAULT 'text',
        options JSONB DEFAULT NULL,
        is_required BOOLEAN DEFAULT false,
        UNIQUE(category_id, field_name)
      )
    `);

    // 3. Update Users Table (Schema Extensions)
    await pool.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS phone VARCHAR(20),
      ADD COLUMN IF NOT EXISTS bio TEXT,
      ADD COLUMN IF NOT EXISTS profile_image VARCHAR(255),
      ADD COLUMN IF NOT EXISTS shipping_address JSONB DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS payment_methods JSONB DEFAULT '[]',
      ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS seller_badge VARCHAR(50),
      ADD COLUMN IF NOT EXISTS rating DECIMAL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS total_sold INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS total_bought INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{"notifications": true, "newsletter": false}',
      ADD COLUMN IF NOT EXISTS joined_date TIMESTAMP DEFAULT NOW()
    `);

    // 4. Create Watch Vault Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS watch_vault (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        watch_name VARCHAR(255) NOT NULL,
        brand VARCHAR(100),
        year VARCHAR(20),
        image_url VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // 5. Update Products Table (Professional Sell Flow)
    await pool.query(`
      ALTER TABLE products 
      ADD COLUMN IF NOT EXISTS item_specifics JSONB DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]',
      ADD COLUMN IF NOT EXISTS condition_code VARCHAR(50),
      ADD COLUMN IF NOT EXISTS condition_details JSONB DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS shipping_info JSONB DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS payment_info JSONB DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES categories(id),
      ADD COLUMN IF NOT EXISTS product_type VARCHAR(50) DEFAULT 'auction',
      ADD COLUMN IF NOT EXISTS auction_end TIMESTAMP,
      ADD COLUMN IF NOT EXISTS allow_offers BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'draft',
      ADD COLUMN IF NOT EXISTS views INTEGER DEFAULT 0
    `);
    
    // 6. Create Chats Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS chats (
        id SERIAL PRIMARY KEY,
        product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
        buyer_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        seller_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(product_id, buyer_id, seller_id)
      )
    `);

    // 7. Create Messages Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        chat_id INTEGER REFERENCES chats(id) ON DELETE CASCADE,
        sender_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        message TEXT NOT NULL,
        is_read BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // 8. Create Condition Templates Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS condition_templates (
        id SERIAL PRIMARY KEY,
        category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
        field_name VARCHAR(100) NOT NULL,
        field_label VARCHAR(100) NOT NULL,
        field_type VARCHAR(50) DEFAULT 'select',
        options JSONB DEFAULT '["Excellent", "Good", "Fair", "Not Working"]',
        UNIQUE(category_id, field_name)
      )
    `);

    // 7. Seed Categories
    const coreCategories = ["Pre-Owned Watches", "New Watches", "Watch Lots", "Accessories", "Tools & Parts"];

    // Cleanup extra categories
    await pool.query("DELETE FROM categories WHERE name NOT IN ($1, $2, $3, $4, $5)", coreCategories);

    for (const cat of coreCategories) {
      await pool.query("INSERT INTO categories (name) VALUES ($1) ON CONFLICT (name) DO NOTHING", [cat]);
    }

    const catRes = await pool.query("SELECT * FROM categories");
    const catMap = {};
    catRes.rows.forEach(row => catMap[row.name] = row.id);

    // 8. Seed Condition Templates (Watch Inspection Points)
    const conditionFields = [
      { cat: "Pre-Owned Watches", name: "crystal", label: "Crystal Condition" },
      { cat: "Pre-Owned Watches", name: "case_condition", label: "Case/Bezel Condition" },
      { cat: "Pre-Owned Watches", name: "movement_status", label: "Movement Performance" },
      { cat: "Pre-Owned Watches", name: "band_condition", label: "Bracelet/Strap Condition" },
      { cat: "New Watches", name: "crystal", label: "Crystal Condition" },
      { cat: "New Watches", name: "case_condition", label: "Case/Bezel Condition" },
      { cat: "New Watches", name: "movement_status", label: "Movement Performance" },
      { cat: "New Watches", name: "band_condition", label: "Bracelet/Strap Condition" },
      { cat: "Watch Lots", name: "lot_completeness", label: "Lot Completeness" },
      { cat: "Tools & Parts", name: "part_compatibility", label: "Part Compatibility" }
    ];

    for (const cf of conditionFields) {
      if (catMap[cf.cat]) {
        await pool.query(`
          INSERT INTO condition_templates (category_id, field_name, field_label)
          VALUES ($1, $2, $3)
          ON CONFLICT (category_id, field_name) DO NOTHING
        `, [catMap[cf.cat], cf.name, cf.label]);
      }
    }

    // 9. Seed Category Specs (Watch Specifics)
    const specs = [
      { cat: "Pre-Owned Watches", name: "brand", label: "Brand", type: "text", required: true },
      { cat: "Pre-Owned Watches", name: "reference_number", label: "Reference Number", type: "text", required: false },
      { cat: "Pre-Owned Watches", name: "movement", label: "Movement", type: "select", options: ["Automatic", "Manual", "Quartz"], required: true },
      { cat: "Pre-Owned Watches", name: "case_material", label: "Case Material", type: "select", options: ["Stainless Steel", "Gold", "Titanium", "Ceramic"], required: true },
      { cat: "Pre-Owned Watches", name: "box_papers", label: "Box & Papers", type: "select", options: ["Full Set", "Box Only", "Papers Only", "Watch Only"], required: true },

      { cat: "New Watches", name: "brand", label: "Brand", type: "text", required: true },
      { cat: "New Watches", name: "reference_number", label: "Reference Number", type: "text", required: false },
      { cat: "New Watches", name: "movement", label: "Movement", type: "select", options: ["Automatic", "Manual", "Quartz"], required: true },
      { cat: "New Watches", name: "case_material", label: "Case Material", type: "select", options: ["Stainless Steel", "Gold", "Titanium", "Ceramic"], required: true },
      { cat: "New Watches", name: "box_papers", label: "Box & Papers", type: "select", options: ["Full Set", "Box Only", "Papers Only", "Watch Only"], required: true },


      { cat: "Watch Lots", name: "item_count", label: "Item Count", type: "number", required: true },
      { cat: "Watch Lots", name: "lot_type", label: "Lot Type", type: "select", options: ["Serviceable", "Parts Only", "Mixed"], required: true },

      { cat: "Accessories", name: "brand", label: "Brand", type: "text", required: false },
      { cat: "Accessories", name: "type", label: "Accessory Type", type: "select", options: ["Strap/Bracelet", "Box", "Tools", "Winder"], required: true },

      { cat: "Tools & Parts", name: "component", label: "Component Type", type: "text", required: true },
      { cat: "Tools & Parts", name: "compatibility", label: "Machine/Caliber Compatibility", type: "text", required: false }
    ];

    for (const s of specs) {
      if (catMap[s.cat]) {
        await pool.query(`
          INSERT INTO category_specs (category_id, field_name, field_label, field_type, options, is_required)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (category_id, field_name) DO UPDATE SET 
            field_label = EXCLUDED.field_label,
            field_type = EXCLUDED.field_type,
            options = EXCLUDED.options,
            is_required = EXCLUDED.is_required
        `, [catMap[s.cat], s.name, s.label, s.type, s.options ? JSON.stringify(s.options) : null, s.required]);
      }
    }

    console.log("Database schema, chat tables and seeds updated successfully.");
    process.exit(0);
  } catch (err) {
    console.error("Seeding failed:", err);
    process.exit(1);
  }
}

seed();
