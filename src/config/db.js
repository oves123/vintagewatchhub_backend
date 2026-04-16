const { Pool } = require("pg");

const dbMode = process.env.DB_MODE || 'local';
const localUrl = process.env.LOCAL_DATABASE_URL || process.env.DATABASE_URL;
const supabaseUrl = process.env.SUPABASE_DATABASE_URL;

const localPool = localUrl ? new Pool({ connectionString: localUrl }) : null;
const supabasePool = supabaseUrl ? new Pool({
  connectionString: supabaseUrl,
  ssl: { rejectUnauthorized: false }
}) : null;

// Helper to determine if a query is a "Write" operation
const isWriteQuery = (text) => {
  if (typeof text !== 'string') return false;
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
          // If we are in "both" mode and it's a write, we execute concurrently but don't let it crash the app if Supabase fails
          // EXCEPT for BEGIN/COMMIT/ROLLBACK which must succeed or fail together ideally
          if (dbMode === 'both') {
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

// Wrapper for the Pool
const pool = {
  query: async (text, params) => {
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
      // Always execute on Local (Primary for Reads)
      const localResult = await localPool.query(text, params);

      // If it's a Write, sync to Supabase
      if (isWrite && supabasePool) {
        supabasePool.query(text, params).catch(err => {
          console.error("⚠️ Supabase Sync Error (Background):", err.message);
          console.error("   Query:", text.substring(0, 100) + "...");
        });
      }

      return localResult;
    }

    // Fallback to local if nothing else matches
    return localPool ? await localPool.query(text, params) : null;
  },

  connect: async () => {
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
  },

  // Expose underlying pools if needed
  localPool,
  supabasePool
};

console.log(`🔌 DB Connection initialized in [${dbMode}] mode.`);

module.exports = pool;