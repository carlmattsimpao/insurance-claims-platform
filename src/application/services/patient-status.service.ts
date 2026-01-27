import { v4 as uuidv4 } from 'uuid';
import {
  patientStatusRepository,
  patientRepository,
} from '../../infrastructure/database/repositories/index.js';
import { claimsQueue } from '../../infrastructure/queue/queue.js';
import type { PatientStatusEvent } from '../../domain/entities/index.js';
import type {
  TenantContext,
  PaginatedResult,
  PatientAdmissionJobData,
  PatientDischargeJobData,
  TreatmentInitiatedJobData,
} from '../../shared/types/index.js';
import { NotFoundError } from '../../domain/errors/index.js';
import type { CreatePatientStatusInput } from '../validators/index.js';
import { logger } from '../../shared/utils/logger.js';

export class PatientStatusService {
  /**
   * Create a patient status change event and trigger background processing
   */
  async createStatusEvent(
    input: CreatePatientStatusInput,
    context: TenantContext
  ): Promise<PatientStatusEvent> {
    // Generate or use provided idempotency key
    const idempotencyKey = input.idempotencyKey || `${input.patientId}-${input.statusType}-${Date.now()}`;

    // Check for duplicate (idempotency)
    const existing = await patientStatusRepository.findByIdempotencyKey(
      idempotencyKey,
      context
    );
    if (existing) {
      logger.info('Duplicate patient status event detected (idempotency)', {
        idempotencyKey,
        existingId: existing.id,
        organizationId: context.organizationId,
      });
      return existing;
    }

    // Verify patient exists
    const patientExists = await patientRepository.exists(input.patientId, context);
    if (!patientExists) {
      throw new NotFoundError('Patient', input.patientId);
    }

    // Create the status event
    const statusEvent = await patientStatusRepository.create(
      {
        patientId: input.patientId,
        organizationId: context.organizationId,
        statusType: input.statusType,
        occurredAt: input.occurredAt,
        details: input.details || {},
        idempotencyKey,
        jobStatus: 'pending',
      },
      context
    );

    // Queue background job based on status type
    try {
      await this.queueJob(statusEvent, context);
      
      logger.info('Patient status event created and job queued', {
        eventId: statusEvent.id,
        patientId: input.patientId,
        statusType: input.statusType,
        organizationId: context.organizationId,
        createdBy: context.userId,
      });
    } catch (error) {
      logger.error('Failed to queue job for patient status event', {
        eventId: statusEvent.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Don't fail the request - the event is created, job can be retried
    }

    return statusEvent;
  }

  /**
   * Queue the appropriate job based on status type
   */
  private async queueJob(
    event: PatientStatusEvent,
    context: TenantContext
  ): Promise<void> {
    const baseJobData = {
      jobId: uuidv4(),
      organizationId: event.organizationId,
      patientId: event.patientId,
      triggeredBy: context.userId,
      triggeredAt: new Date().toISOString(),
      idempotencyKey: `job-${event.idempotencyKey}`,
    };

    let jobData: PatientAdmissionJobData | PatientDischargeJobData | TreatmentInitiatedJobData;
    let jobName: string;

    switch (event.statusType) {
      case 'admission':
        jobData = {
          ...baseJobData,
          type: 'patient_admission' as const,
        };
        jobName = 'patient_admission';
        break;

      case 'discharge':
        jobData = {
          ...baseJobData,
          type: 'patient_discharge' as const,
        };
        jobName = 'patient_discharge';
        break;

      case 'treatment':
        jobData = {
          ...baseJobData,
          type: 'treatment_initiated' as const,
          treatmentType: event.details.treatmentType || 'general',
        };
        jobName = 'treatment_initiated';
        break;

      default:
        throw new Error(`Unknown status type: ${event.statusType}`);
    }

    // Add job to queue with retry configuration
    await claimsQueue.add(jobName, jobData, {
      jobId: baseJobData.jobId,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000, // Start with 1 second
      },
      removeOnComplete: {
        age: 24 * 3600, // Keep completed jobs for 24 hours
        count: 1000,
      },
      removeOnFail: {
        age: 7 * 24 * 3600, // Keep failed jobs for 7 days
      },
    });

    // Update the status event with job ID
    await patientStatusRepository.updateJobStatus(
      event.id,
      baseJobData.jobId,
      'processing',
      context
    );
  }

  /**
   * Get patient status history
   */
  async getPatientHistory(
    patientId: string,
    context: TenantContext,
    pagination?: { limit: number; offset: number }
  ): Promise<PaginatedResult<PatientStatusEvent>> {
    // Verify patient exists
    const patientExists = await patientRepository.exists(patientId, context);
    if (!patientExists) {
      throw new NotFoundError('Patient', patientId);
    }

    return await patientStatusRepository.getHistory(patientId, context, pagination);
  }

  /**
   * Get a specific status event
   */
  async getStatusEvent(
    id: string,
    context: TenantContext
  ): Promise<PatientStatusEvent> {
    const event = await patientStatusRepository.findById(id, context);

    if (!event) {
      throw new NotFoundError('Patient status event', id);
    }

    return event;
  }
}

export const patientStatusService = new PatientStatusService();
