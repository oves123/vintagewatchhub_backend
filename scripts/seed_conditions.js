require('dotenv').config({ path: '../.env' });
const pool = require('../src/config/db');

async function seed() {
  try {
    const categoriesResult = await pool.query("SELECT * FROM categories");
    const getCatId = (name) => {
      const cat = categoriesResult.rows.find(c => c.name.toLowerCase().includes(name.toLowerCase()));
      return cat ? cat.id : null;
    };

    const watchId = getCatId('Pre-Owned Watches');
    const lotsId = getCatId('Watch Lots');
    const accId = getCatId('Accessories');
    const toolsId = getCatId('Tools & Parts');

    console.log(`Seeding Condition Templates for - Watch: ${watchId}, Lots: ${lotsId}, Acc: ${accId}, Tools: ${toolsId}`);

    const conditionTemplates = [
      // WATCHES
      { category_id: watchId, field_name: 'crystal', field_label: 'Crystal Condition', options: ['Pristine', 'Micro-scratches', 'Visible Scratches', 'Chipped', 'Cracked', 'Aftermarket Replacement'] },
      { category_id: watchId, field_name: 'case', field_label: 'Case & Bezel', options: ['Unpolished/Mint', 'Light Wear', 'Significant Scratches', 'Dented', 'Polished'] },
      { category_id: watchId, field_name: 'movement', field_label: 'Movement Performance', options: ['Running Strong', 'Keeping Time (Unchecked)', 'Losing/Gaining Time', 'Stopping Intermittently', 'Not Running', 'Serviced Recently'] },
      { category_id: watchId, field_name: 'dial', field_label: 'Dial & Hands', options: ['Original/Perfect', 'Patina/Tropical', 'Minor Fading', 'Re-dialed', 'Damaged/Missing'] },
      
      // LOTS
      { category_id: lotsId, field_name: 'lot_variety', field_label: 'Variety Balance', options: ['Mostly Men\'s', 'mostly Women\'s', 'Mixed Styles', 'High-End Mix', 'Entry-Level Mix'] },
      
      // ACCESSORIES
      { category_id: accId, field_name: 'originality', field_label: 'Authenticity Proof', options: ['Original Stamps', 'Matched Serial', 'Reproduction', 'Generic Replacement'] }
    ];

    for (const ct of conditionTemplates) {
      if (!ct.category_id) continue;
      await pool.query(
        "INSERT INTO condition_templates (category_id, field_name, field_label, options) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING",
        [ct.category_id, ct.field_name, ct.field_label, JSON.stringify(ct.options)]
      );
    }

    console.log("Condition seeding completed successfully!");
    process.exit(0);
  } catch (err) {
    console.error("Seeding Error:", err);
    process.exit(1);
  }
}

seed();
