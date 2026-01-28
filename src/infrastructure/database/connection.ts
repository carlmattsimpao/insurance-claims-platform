import { env } from '../../config/env.js';
import * as schema from './schema/index.js';
import postgres from 'postgres';
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';

// Detect if using Neon (cloud) or local PostgreSQL
const isNeon = env.DATABASE_URL.includes('neon.tech');

// Create postgres.js client (works with both Neon and local PostgreSQL)
const pgClient = postgres(env.DATABASE_URL, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
  ssl: isNeon ? 'require' : false,  // SSL required for Neon, not for local
});

// Create the Drizzle instance with schema
export const db = drizzlePostgres(pgClient, { schema });

// Export for transactions (same client)
export const dbWithTransactions = db;

// Export types
export type Database = typeof db;

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
    await pgClient`SELECT 1`;
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
    return false;
  }
}