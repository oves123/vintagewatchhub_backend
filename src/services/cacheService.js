const pool = require("../config/db");

const MEMORY_CACHE = new Map();
const TTL = 5 * 60 * 1000;

const CACHE_TTL = {
  "products:featured": 2 * 60 * 1000,
  "categories": 10 * 60 * 1000,
  "brands": 10 * 60 * 1000,
  "admin:stats": 60 * 1000,
  "admin:analytics": 60 * 1000,
};

exports.get = async (key) => {
  const memCached = MEMORY_CACHE.get(key);
  if (memCached && Date.now() < memCached.expires) {
    return memCached.value;
  }
  MEMORY_CACHE.delete(key);

  try {
    const result = await pool.query(
      "SELECT value FROM cache_store WHERE key = $1 AND expires_at > NOW()",
      [key]
    );
    if (result.rows.length > 0) {
      const value = result.rows[0].value;
      MEMORY_CACHE.set(key, { value, expires: Date.now() + 30000 });
      return value;
    }
  } catch (e) { /* ignore */ }
  return null;
};

exports.set = async (key, value) => {
  const ttl = CACHE_TTL[key] || TTL;
  const expires = new Date(Date.now() + ttl);

  MEMORY_CACHE.set(key, { value, expires: Date.now() + Math.min(ttl, 60000) });

  try {
    await pool.query(
      `INSERT INTO cache_store (key, value, expires_at)
       VALUES ($1, $2::jsonb, $3)
       ON CONFLICT (key) DO UPDATE SET value = $2::jsonb, expires_at = $3`,
      [key, JSON.stringify(value), expires]
    );
  } catch (e) { /* ignore */ }
};

exports.del = async (key) => {
  MEMORY_CACHE.delete(key);
  try {
    await pool.query("DELETE FROM cache_store WHERE key = $1", [key]);
  } catch (e) { /* ignore */ }
};

exports.delPattern = async (pattern) => {
  for (const key of MEMORY_CACHE.keys()) {
    if (key.startsWith(pattern)) MEMORY_CACHE.delete(key);
  }
  try {
    await pool.query("DELETE FROM cache_store WHERE key LIKE $1", [`${pattern}%`]);
  } catch (e) { /* ignore */ }
};

exports.clear = async () => {
  MEMORY_CACHE.clear();
  try {
    await pool.query("DELETE FROM cache_store WHERE expires_at > NOW()");
  } catch (e) { /* ignore */ }
};
