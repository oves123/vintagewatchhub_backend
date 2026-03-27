const { Pool } = require("pg");

const poolConfig = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : {
      user: process.env.DB_USER,
      host: process.env.DB_HOST,
      database: process.env.DB_NAME,
      password: String(process.env.DB_PASSWORD),
      port: process.env.DB_PORT
    };

const pool = new Pool(poolConfig);

module.exports = pool;