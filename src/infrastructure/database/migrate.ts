import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { db } from './connection.js';
import { logger } from '../../shared/utils/logger.js';

async function runMigrations(): Promise<void> {
  logger.info('Running database migrations...');

  try {
    await migrate(db, { migrationsFolder: './drizzle' });
    logger.info('✅ Migrations completed successfully');
  } catch (error) {
    logger.error('❌ Migration failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    process.exit(1);
  }

  process.exit(0);
}

runMigrations();