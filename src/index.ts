import { env } from './config/env.js';
import { createApp } from './presentation/app.js';
import { logger } from './shared/utils/logger.js';
import { closeQueue } from './infrastructure/queue/queue.js';

// Create Express application
const app = createApp();

// Start server
const server = app.listen(env.PORT, () => {
  logger.info(`🚀 Server started`, {
    port: env.PORT,
    environment: env.NODE_ENV,
  });
  logger.info(`📋 API available at http://localhost:${env.PORT}/api`);
  logger.info(`💚 Health check at http://localhost:${env.PORT}/health`);
});

// Graceful shutdown handler
async function shutdown(signal: string): Promise<void> {
  logger.info(`${signal} received, starting graceful shutdown...`);

  // Stop accepting new connections
  server.close(async () => {
    logger.info('HTTP server closed');

    try {
      // Close queue connections
      await closeQueue();
      logger.info('Queue connections closed');

      // Add any other cleanup here (e.g., database connections)
      
      logger.info('Graceful shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      process.exit(1);
    }
  });

  // Force shutdown after timeout
  setTimeout(() => {
    logger.error('Forced shutdown due to timeout');
    process.exit(1);
  }, 30000); // 30 second timeout
}

// Handle shutdown signals
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', {
    error: error.message,
    stack: error.stack,
  });
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
  });
  process.exit(1);
});

export default app;
