require('dotenv').config();
const fs = require('fs');
const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'watch_marketplace',
    password: String(process.env.DB_PASSWORD || '400102'),
    port: process.env.DB_PORT || 5432,
});

let output = "-- Database Schema Dump --\n";

async function dumpSchema() {
    try {
        
        // 1. Get all tables
        const tablesRes = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_type = 'BASE TABLE'
            AND table_name NOT LIKE 'pg_%'
            AND table_name NOT LIKE 'sql_%'
        `);
        
        const tables = tablesRes.rows.map(r => r.table_name);

        let creationSql = "";
        let constraintSql = "";

        for (const table of tables) {
            creationSql += `\n-- Table: ${table}\n`;
            
            // Get columns
            const columnsRes = await pool.query(`
                SELECT column_name, data_type, is_nullable, column_default, character_maximum_length
                FROM information_schema.columns 
                WHERE table_name = $1
                ORDER BY ordinal_position
            `, [table]);

            let createTableSql = `CREATE TABLE IF NOT EXISTS ${table} (\n`;
            const colDefs = columnsRes.rows.map(col => {
                let def = `  ${col.column_name} ${col.data_type}`;
                if (col.character_maximum_length) def += `(${col.character_maximum_length})`;
                if (col.is_nullable === 'NO') def += " NOT NULL";
                if (col.column_default) {
                    if (col.column_default.includes('nextval')) {
                        if (col.data_type === 'integer') def = `  ${col.column_name} SERIAL`;
                        else if (col.data_type === 'bigint') def = `  ${col.column_name} BIGSERIAL`;
                    } else {
                        def += ` DEFAULT ${col.column_default}`;
                    }
                }
                return def;
            });
            createTableSql += colDefs.join(',\n');

            const pkRes = await pool.query(`
                SELECT kcu.column_name
                FROM information_schema.table_constraints tc 
                JOIN information_schema.key_column_usage kcu 
                  ON tc.constraint_name = kcu.constraint_name 
                  AND tc.table_name = kcu.table_name
                WHERE tc.constraint_type = 'PRIMARY KEY' 
                AND tc.table_name = $1
            `, [table]);

            if (pkRes.rows.length > 0) {
                createTableSql += `,\n  PRIMARY KEY (${pkRes.rows.map(r => r.column_name).join(', ')})`;
            }

            createTableSql += '\n);\n';
            creationSql += createTableSql;

            const fkRes = await pool.query(`
                SELECT
                    tc.constraint_name, 
                    kcu.column_name, 
                    ccu.table_name AS foreign_table_name,
                    ccu.column_name AS foreign_column_name 
                FROM 
                    information_schema.table_constraints AS tc 
                    JOIN information_schema.key_column_usage AS kcu
                      ON tc.constraint_name = kcu.constraint_name
                      AND tc.table_name = kcu.table_name
                    JOIN information_schema.constraint_column_usage AS ccu
                      ON ccu.constraint_name = tc.constraint_name
                      AND ccu.table_schema = tc.table_schema
                WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = $1
            `, [table]);

            for (const fk of fkRes.rows) {
                constraintSql += `ALTER TABLE ${table} ADD CONSTRAINT ${fk.constraint_name} FOREIGN KEY (${fk.column_name}) REFERENCES ${fk.foreign_table_name}(${fk.foreign_column_name});\n`;
            }
        }

        output += creationSql + "\n-- Constraints --\n" + constraintSql;
        fs.writeFileSync('schema_dump.sql', output);
        console.log("Schema dump written to schema_dump.sql");
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

// Helper to push to output
function log(msg) {
  output += msg + "\n";
}

dumpSchema();
