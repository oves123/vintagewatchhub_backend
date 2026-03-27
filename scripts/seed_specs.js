require('dotenv').config({ path: '../.env' });
const pool = require('../src/config/db');

async function seed() {
  try {
    // 1. Get Categories
    const categories = await pool.query("SELECT * FROM categories");
    const getCatId = (name) => {
      const cat = categories.rows.find(c => c.name.toLowerCase().includes(name.toLowerCase()));
      return cat ? cat.id : null;
    };

    const watchId = getCatId('Pre-Owned Watches');
    const lotsId = getCatId('Watch Lots');
    const accId = getCatId('Accessories');
    const toolsId = getCatId('Tools & Parts');

    console.log(`IDs found - Watch: ${watchId}, Lots: ${lotsId}, Acc: ${accId}, Tools: ${toolsId}`);

    // Clean existing specs for these categories (optional, for safety during development)
    // await pool.query("DELETE FROM category_specs WHERE category_id IN ($1, $2, $3, $4)", [watchId, lotsId, accId, toolsId]);

    const specs = [
      // WATCHES
      { category_id: watchId, field_name: 'brand', field_label: 'Brand', field_type: 'select', options: ['Rolex', 'Omega', 'Seiko', 'Patek Philippe', 'Audemars Piguet', 'Cartier', 'Tag Heuer', 'Breitling', 'Tudor', 'IWC', 'Other'], is_required: true },
      { category_id: watchId, field_name: 'movement', field_label: 'Movement', field_type: 'select', options: ['Automatic', 'Manual Wind', 'Quartz', 'Kinetic', 'Other'], is_required: true },
      { category_id: watchId, field_name: 'case_size', field_label: 'Case Size (mm)', field_type: 'select', options: ['< 34mm', '34mm', '36mm', '38mm', '40mm', '42mm', '44mm', '46mm+', 'Other'], is_required: true },
      { category_id: watchId, field_name: 'dial_color', field_label: 'Dial Color', field_type: 'select', options: ['Black', 'Blue', 'White', 'Silver', 'Gold', 'Green', 'Other'], is_required: false },
      { category_id: watchId, field_name: 'bracelet_material', field_label: 'Bracelet Material', field_type: 'select', options: ['Stainless Steel', 'Leather', 'Rubber', 'Gold', 'Titanium', 'Other'], is_required: false },
      { category_id: watchId, field_name: 'year', field_label: 'Year of Production', field_type: 'number', options: [], is_required: false },

      // WATCH LOTS
      { category_id: lotsId, field_name: 'pack_size', field_label: 'Number of Items', field_type: 'number', options: [], is_required: true },
      { category_id: lotsId, field_name: 'mix_type', field_label: 'Lot Composition', field_type: 'select', options: ['Mixed Brands', 'Single Brand', 'Movements Only', 'Cases Only', 'Unsorted'], is_required: true },
      { category_id: lotsId, field_name: 'avg_condition', field_label: 'Average Condition', field_type: 'select', options: ['Mostly Working', 'Mixed State', 'Mostly Spares/Repair', 'Unchecked'], is_required: true },

      // ACCESSORIES
      { category_id: accId, field_name: 'acc_type', field_label: 'Accessory Type', field_type: 'select', options: ['Original Box', 'Manuals/Papers', 'Links', 'Buckles/Clasps', 'Pouch', 'Other'], is_required: true },
      { category_id: accId, field_name: 'material', field_label: 'Material', field_type: 'select', options: ['Wood', 'Leather', 'Steel', 'Gold', 'Fabric', 'Other'], is_required: false },

      // TOOLS & PARTS
      { category_id: toolsId, field_name: 'tool_cat', field_label: 'Tool Category', field_type: 'select', options: ['Precision Screwdrivers', 'Case Openers', 'Spring Bar Tools', 'Cleaning Supplies', 'Loupes/Magnifiers', 'Other'], is_required: true },
      { category_id: toolsId, field_name: 'part_type', field_label: 'Part Type', field_type: 'select', options: ['Gaskets', 'Crowns', 'Crystals', 'Mainsprings', 'Screws', 'Hands', 'Other'], is_required: true },
      { category_id: toolsId, field_name: 'compatibility', field_label: 'Brand Compatibility', field_type: 'text', options: [], is_required: false }
    ];

    for (const spec of specs) {
      if (!spec.category_id) continue;
      await pool.query(
        "INSERT INTO category_specs (category_id, field_name, field_label, field_type, options, is_required) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING",
        [spec.category_id, spec.field_name, spec.field_label, spec.field_type, JSON.stringify(spec.options), spec.is_required]
      );
    }

    console.log("Seeding completed successfully!");
    process.exit(0);
  } catch (err) {
    console.error("Seeding Error:", err);
    process.exit(1);
  }
}

seed();
