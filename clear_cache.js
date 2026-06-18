require('dotenv').config();
const cache = require('./src/services/cacheService');

async function clearCache() {
  try {
    await cache.del('categories');
    await cache.delPattern('products:');
    await cache.delPattern('filter:counts');
    console.log('✅ Cache cleared: categories, products, filter:counts');
  } catch(e) {
    console.error('Cache clear failed:', e.message);
  }
  process.exit(0);
}
clearCache();
