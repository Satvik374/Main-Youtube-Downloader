import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { drizzle as drizzleSQLite } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

let db: any;
let pool: Pool | null = null;

// Use SQLite for local development if DATABASE_URL is not set
if (!process.env.DATABASE_URL) {
  console.log('DATABASE_URL not set, using SQLite for local development');
  const sqlite = new Database('local.db');
  
  // Create tables if they don't exist
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS download_history (
      id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      format TEXT NOT NULL,
      quality TEXT,
      file_size TEXT,
      thumbnail TEXT,
      status TEXT NOT NULL DEFAULT 'completed',
      downloaded_at INTEGER DEFAULT (unixepoch())
    );
    
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL
    );
  `);
  
  db = drizzleSQLite(sqlite, { 
    schema: {
      downloadHistory: schema.downloadHistorySQLite,
      users: schema.usersSQLite
    }
  });
} else {
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  db = drizzle({ client: pool, schema });
}

export { db, pool };
