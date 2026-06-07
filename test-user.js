require('dotenv').config();
const bcrypt = require('bcrypt');
const pool = require('./src/config/db');

(async () => {
  try {
    const hashed = await bcrypt.hash('password123', 10);
    const result = await pool.query(
      `INSERT INTO users(name, email, password, terms_accepted, role) 
       VALUES('Test User', 'test2@test.com', $1, true, 'buyer') RETURNING id`,
      [hashed]
    );
    console.log('User created:', result.rows[0]);
  } catch(e) {
    console.log('Error:', e);
  } finally {
    pool.end();
  }
})();
