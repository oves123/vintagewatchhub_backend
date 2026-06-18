require('dotenv').config();
const pool = require('./src/config/db');

async function alterDB() {
  try {
    await pool.query(`
      ALTER TABLE categories
      ADD COLUMN parent_id INTEGER REFERENCES categories(id) ON DELETE CASCADE;
    `);
    console.log("Column parent_id added successfully.");
  } catch (err) {
    if (err.message.includes('already exists')) {
      console.log("Column already exists.");
    } else {
      console.error("Error altering table:", err);
    }
  } finally {
    pool.end();
  }
}

alterDB();
