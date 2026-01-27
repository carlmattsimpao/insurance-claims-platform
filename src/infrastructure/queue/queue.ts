import { Queue, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '../../config/env.js';
import { logger } from '../../shared/utils/logger.js';
import type { ClaimJobData } from '../../shared/types/index.js';

// Create Redis connection for BullMQ
// Note: Upstash requires TLS, handled by rediss:// protocol
export const redisConnection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null, // Required for BullMQ
  enableReadyCheck: false,
  retryStrategy: (times) => {
    if (times > 3) {
      logger.error('Redis connection failed after 3 retries');
      return null;
    }
    return Math.min(times * 200, 1000);
  },
});

redisConnection.on('connect', () => {
  logger.info('Redis connected');
});

redisConnection.on('error', (err) => {
  logger.error('Redis connection error', { error: err.message });
});

// Create the claims processing queue
export const claimsQueue = new Queue<ClaimJobData>(env.BULL_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: {
      age: 24 * 3600, // 24 hours
      count: 1000,
    },
    removeOnFail: {
      age: 7 * 24 * 3600, // 7 days
    },
  },
});

// Queue events for monitoring
export const queueEvents = new QueueEvents(env.BULL_QUEUE_NAME, {
  connection: redisConnection,
});

queueEvents.on('completed', ({ jobId }) => {
  logger.info('Job completed', { jobId });
});

queueEvents.on('failed', ({ jobId, failedReason }) => {
  logger.error('Job failed', { jobId, failedReason });
});

queueEvents.on('stalled', ({ jobId }) => {
  logger.warn('Job stalled', { jobId });
});

// Health check
export async function checkQueueHealth(): Promise<boolean> {
  try {
    await claimsQueue.getJobCounts();
    return true;
  } catch (error) {
    logger.error('Queue health check failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return false;
  }
}

// Get queue stats
export async function getQueueStats(): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}> {
  const counts = await claimsQueue.getJobCounts();
  return {
    waiting: counts.waiting,
    active: counts.active,
    completed: counts.completed,
    failed: counts.failed,
    delayed: counts.delayed,
  };
}

// Graceful shutdown
export async function closeQueue(): Promise<void> {
  await queueEvents.close();
  await claimsQueue.close();
  await redisConnection.quit();
  logger.info('Queue connections closed');
}
