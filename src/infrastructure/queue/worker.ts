import { Worker, Job } from 'bullmq';
import { redisConnection } from './queue.js';
import { env } from '../../config/env.js';
import {
  processPatientAdmission,
  processPatientDischarge,
  processTreatmentInitiated,
} from './jobs/claim-jobs.js';
import type {
  ClaimJobData,
  PatientAdmissionJobData,
  PatientDischargeJobData,
  TreatmentInitiatedJobData,
} from '../../shared/types/index.js';
import { jobLogger as logger } from '../../shared/utils/logger.js';

// Job processor function
async function processJob(job: Job<ClaimJobData>): Promise<unknown> {
  const { data, name, id, attemptsMade } = job;

  logger.info('Processing job', {
    jobId: id,
    jobName: name,
    attemptsMade,
    idempotencyKey: data.idempotencyKey,
  });

  try {
    let result: unknown;

    switch (data.type) {
      case 'patient_admission':
        result = await processPatientAdmission(data as PatientAdmissionJobData);
        break;

      case 'patient_discharge':
        result = await processPatientDischarge(data as PatientDischargeJobData);
        break;

      case 'treatment_initiated':
        result = await processTreatmentInitiated(data as TreatmentInitiatedJobData);
        break;

      default:
        throw new Error(`Unknown job type: ${(data as ClaimJobData).type}`);
    }

    logger.info('Job completed successfully', {
      jobId: id,
      jobName: name,
      result,
    });

    return result;
  } catch (error) {
    logger.error('Job processing failed', {
      jobId: id,
      jobName: name,
      attemptsMade,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });

    throw error;
  }
}

// Create the worker
export const worker = new Worker<ClaimJobData>(
  env.BULL_QUEUE_NAME,
  processJob,
  {
    connection: redisConnection,
    concurrency: 5, // Process up to 5 jobs concurrently
    limiter: {
      max: 100,
      duration: 1000, // Max 100 jobs per second
    },
  }
);

// Worker event handlers
worker.on('completed', (job) => {
  logger.info('Worker: Job completed', {
    jobId: job.id,
    jobName: job.name,
  });
});

worker.on('failed', (job, error) => {
  logger.error('Worker: Job failed', {
    jobId: job?.id,
    jobName: job?.name,
    attemptsMade: job?.attemptsMade,
    error: error.message,
  });
});

worker.on('error', (error) => {
  logger.error('Worker error', { error: error.message });
});

worker.on('stalled', (jobId) => {
  logger.warn('Worker: Job stalled', { jobId });
});

// Graceful shutdown
async function shutdown(): Promise<void> {
  logger.info('Worker shutting down...');
  await worker.close();
  await redisConnection.quit();
  logger.info('Worker shut down complete');
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start message
logger.info('Worker started', {
  queue: env.BULL_QUEUE_NAME,
  concurrency: 5,
});
