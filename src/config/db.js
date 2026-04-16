const { Pool } = require("pg");
const { EventEmitter } = require("events");

const dbMode = (process.env.DB_MODE || 'local').toLowerCase();
const localUrl = process.env.LOCAL_DATABASE_URL || process.env.DATABASE_URL;
const supabaseUrl = process.env.SUPABASE_DATABASE_URL;

const localPool = localUrl ? new Pool({ connectionString: localUrl }) : null;
const supabasePool = supabaseUrl ? new Pool({
  connectionString: supabaseUrl,
  ssl: { rejectUnauthorized: false }
}) : null;

// Helper to determine if a query is a "Write" operation
const isWriteQuery = (query) => {
  let text = '';
  if (typeof query === 'string') {
    text = query;
  } else if (query && typeof query === 'object' && query.text) {
    text = query.text;
  }
  return /^\s*(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|TRUNCATE|BEGIN|COMMIT|ROLLBACK)/i.test(text);
};

// Wrapper for Clients (Transactions)
class DualClient {
  constructor(localClient, supabaseClient) {
    this.localClient = localClient;
    this.supabaseClient = supabaseClient;
  }

  async query(text, params) {
    const isWrite = isWriteQuery(text);

    // Always execute on local
    let localResult;
    if (this.localClient) {
      localResult = await this.localClient.query(text, params);
    }

    // Execute on Supabase if in "both" or "supabase" mode
    if (this.supabaseClient && (dbMode === 'both' || dbMode === 'supabase')) {
      if (isWrite || dbMode === 'supabase') {
        try {
          if (dbMode === 'both') {
            // Background sync for "both" mode
            this.supabaseClient.query(text, params).catch(err => {
              console.error("⚠️ Supabase Transaction Sync Error:", err.message);
            });
          } else {
            return await this.supabaseClient.query(text, params);
          }
        } catch (err) {
          console.error("❌ Supabase Transaction Error:", err.message);
        }
      }
    }

    return localResult;
  }

  release() {
    if (this.localClient) this.localClient.release();
    if (this.supabaseClient) this.supabaseClient.release();
  }
}

// Wrapper for the Pool using EventEmitter for compatibility
class DualPool extends EventEmitter {
  constructor() {
    super();
    // Forward errors from internal pools
    if (localPool) localPool.on('error', (err) => this.emit('error', err));
    if (supabasePool) supabasePool.on('error', (err) => this.emit('error', err));
  }

  async query(text, params) {
    const isWrite = isWriteQuery(text);

    // 1. Handle "supabase" only mode
    if (dbMode === 'supabase' && supabasePool) {
      return await supabasePool.query(text, params);
    }

    // 2. Handle "local" mode
    if (dbMode === 'local' && localPool) {
      return await localPool.query(text, params);
    }

    // 3. Handle "both" mode
    if (dbMode === 'both') {
      const localResult = await localPool.query(text, params);

      if (isWrite && supabasePool) {
        supabasePool.query(text, params).catch(err => {
          console.error("⚠️ Supabase Sync Error (Background):", err.message);
        });
      }

      return localResult;
    }

    return localPool ? await localPool.query(text, params) : null;
  }

  async connect() {
    let localClient, supabaseClient;

    if (dbMode === 'local' || dbMode === 'both') {
      localClient = await localPool.connect();
    }

    if (dbMode === 'supabase' || dbMode === 'both') {
      if (supabasePool) {
        try {
          supabaseClient = await supabasePool.connect();
        } catch (err) {
          console.error("❌ Failed to connect to Supabase client:", err.message);
          if (dbMode === 'supabase') throw err;
        }
      }
    }

    return new DualClient(localClient, supabaseClient);
  }

  // Support for pool.end()
  async end() {
    const tasks = [];
    if (localPool) tasks.push(localPool.end());
    if (supabasePool) tasks.push(supabasePool.end());
    return Promise.all(tasks);
  }
}

const pool = new DualPool();

// Expose underlying pools for specialized tasks
pool.localPool = localPool;
pool.supabasePool = supabasePool;

console.log(`🔌 DB Connection initialized in [${dbMode}] mode.`);

module.exports = pool;