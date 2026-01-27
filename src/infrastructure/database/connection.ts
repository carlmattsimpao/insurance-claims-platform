import { drizzle } from 'drizzle-orm/neon-http';
import { neon, neonConfig } from '@neondatabase/serverless';
import { env } from '../../config/env.js';
import * as schema from './schema/index.js';

// Configure Neon for serverless
neonConfig.fetchConnectionCache = true;

// Create the SQL client
const sql = neon(env.DATABASE_URL);

// Create the Drizzle instance with schema
export const db = drizzle(sql as Parameters<typeof drizzle>[0], { schema });

// Export types
export type Database = typeof db;

// For transactions (using postgres.js for full transaction support)
import postgres from 'postgres';

// Create a postgres.js client for transactions
const pgClient = postgres(env.DATABASE_URL, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';

export const dbWithTransactions = drizzlePostgres(pgClient, { schema });

// Transaction helper
export async function runInTransaction<T>(
  fn: (tx: typeof dbWithTransactions) => Promise<T>
): Promise<T> {
  return await dbWithTransactions.transaction(async (tx) => {
    return await fn(tx as unknown as typeof dbWithTransactions);
  });
}

// Health check
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await sql`SELECT 1`;
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
    return false;
  }
}
