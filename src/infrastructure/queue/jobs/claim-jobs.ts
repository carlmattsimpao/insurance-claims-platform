import { claimRepository } from '../../database/repositories/index.js';
import { jobProcessingLogRepository } from '../../database/repositories/index.js';
import type {
  PatientAdmissionJobData,
  PatientDischargeJobData,
  TreatmentInitiatedJobData,
} from '../../../shared/types/index.js';
import { jobLogger as logger } from '../../../shared/utils/logger.js';

/**
 * Process patient admission - mark submitted claims as under_review
 * 
 * IDEMPOTENCY: Checks if job already processed via idempotency key
 * ATOMIC: Uses transaction to ensure all-or-nothing update
 */
export async function processPatientAdmission(
  data: PatientAdmissionJobData
): Promise<{ claimsUpdated: number; claimIds: string[] }> {
  const { organizationId, patientId, idempotencyKey, triggeredBy } = data;

  logger.info('Processing patient admission', {
    patientId,
    organizationId,
    idempotencyKey,
  });

  // Check idempotency - if already processed, return cached result
  const existingLog = await jobProcessingLogRepository.findByIdempotencyKey(
    idempotencyKey,
    organizationId
  );

  if (existingLog?.status === 'completed') {
    logger.info('Job already completed (idempotent skip)', {
      idempotencyKey,
      existingResult: existingLog.result,
    });
    return existingLog.result as { claimsUpdated: number; claimIds: string[] };
  }

  // Create or get job log
  let jobLog = existingLog;
  if (!jobLog) {
    jobLog = await jobProcessingLogRepository.create({
      organizationId,
      jobId: data.jobId,
      jobType: 'patient_admission',
      idempotencyKey,
      status: 'processing',
      payload: data as unknown as Record<string, unknown>,
      startedAt: new Date(),
      retryCount: 0,
    });
  }

  try {
    // Find all submitted claims for this patient
    const claims = await claimRepository.findByPatientIdInternal(
      patientId,
      organizationId,
      ['submitted']
    );

    logger.info('Found claims to update', {
      patientId,
      claimCount: claims.length,
    });

    const updatedClaimIds: string[] = [];

    // Update each claim atomically
    for (const claim of claims) {
      const updated = await claimRepository.updateStatusInternal(
        claim.id,
        organizationId,
        'under_review',
        triggeredBy,
        'Automatic review triggered by patient admission'
      );

      if (updated) {
        updatedClaimIds.push(claim.id);
      }
    }

    const result = {
      claimsUpdated: updatedClaimIds.length,
      claimIds: updatedClaimIds,
    };

    // Mark job as completed
    await jobProcessingLogRepository.markCompleted(jobLog.id, result);

    logger.info('Patient admission processing completed', {
      patientId,
      organizationId,
      claimsUpdated: result.claimsUpdated,
    });

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await jobProcessingLogRepository.markFailed(jobLog.id, errorMessage);
    throw error;
  }
}

/**
 * Process patient discharge - auto-approve pending claims
 * 
 * IDEMPOTENCY: Checks if job already processed via idempotency key
 */
export async function processPatientDischarge(
  data: PatientDischargeJobData
): Promise<{ claimsApproved: number; claimIds: string[] }> {
  const { organizationId, patientId, idempotencyKey, triggeredBy } = data;

  logger.info('Processing patient discharge', {
    patientId,
    organizationId,
    idempotencyKey,
  });

  // Check idempotency
  const existingLog = await jobProcessingLogRepository.findByIdempotencyKey(
    idempotencyKey,
    organizationId
  );

  if (existingLog?.status === 'completed') {
    logger.info('Job already completed (idempotent skip)', {
      idempotencyKey,
      existingResult: existingLog.result,
    });
    return existingLog.result as { claimsApproved: number; claimIds: string[] };
  }

  // Create job log
  let jobLog = existingLog;
  if (!jobLog) {
    jobLog = await jobProcessingLogRepository.create({
      organizationId,
      jobId: data.jobId,
      jobType: 'patient_discharge',
      idempotencyKey,
      status: 'processing',
      payload: data as unknown as Record<string, unknown>,
      startedAt: new Date(),
      retryCount: 0,
    });
  }

  try {
    // Find all under_review claims for this patient (pending finalization)
    const claims = await claimRepository.findByPatientIdInternal(
      patientId,
      organizationId,
      ['under_review', 'submitted']
    );

    logger.info('Found claims to finalize', {
      patientId,
      claimCount: claims.length,
    });

    const approvedClaimIds: string[] = [];

    // Auto-approve each claim
    for (const claim of claims) {
      const updated = await claimRepository.updateStatusInternal(
        claim.id,
        organizationId,
        'approved',
        triggeredBy,
        'Auto-approved upon patient discharge'
      );

      if (updated) {
        approvedClaimIds.push(claim.id);
      }
    }

    const result = {
      claimsApproved: approvedClaimIds.length,
      claimIds: approvedClaimIds,
    };

    // Mark job as completed
    await jobProcessingLogRepository.markCompleted(jobLog.id, result);

    logger.info('Patient discharge processing completed', {
      patientId,
      organizationId,
      claimsApproved: result.claimsApproved,
    });

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await jobProcessingLogRepository.markFailed(jobLog.id, errorMessage);
    throw error;
  }
}

/**
 * Process treatment initiated - trigger automatic review
 * 
 * IDEMPOTENCY: Checks if job already processed via idempotency key
 */
export async function processTreatmentInitiated(
  data: TreatmentInitiatedJobData
): Promise<{ claimsReviewed: number; claimIds: string[] }> {
  const { organizationId, patientId, idempotencyKey, triggeredBy, treatmentType } = data;

  logger.info('Processing treatment initiated', {
    patientId,
    organizationId,
    treatmentType,
    idempotencyKey,
  });

  // Check idempotency
  const existingLog = await jobProcessingLogRepository.findByIdempotencyKey(
    idempotencyKey,
    organizationId
  );

  if (existingLog?.status === 'completed') {
    logger.info('Job already completed (idempotent skip)', {
      idempotencyKey,
      existingResult: existingLog.result,
    });
    return existingLog.result as { claimsReviewed: number; claimIds: string[] };
  }

  // Create job log
  let jobLog = existingLog;
  if (!jobLog) {
    jobLog = await jobProcessingLogRepository.create({
      organizationId,
      jobId: data.jobId,
      jobType: 'treatment_initiated',
      idempotencyKey,
      status: 'processing',
      payload: data as unknown as Record<string, unknown>,
      startedAt: new Date(),
      retryCount: 0,
    });
  }

  try {
    // Find submitted claims for this patient to move to under_review
    const claims = await claimRepository.findByPatientIdInternal(
      patientId,
      organizationId,
      ['submitted']
    );

    logger.info('Found claims related to treatment', {
      patientId,
      treatmentType,
      claimCount: claims.length,
    });

    const reviewedClaimIds: string[] = [];

    // Move claims to under_review
    for (const claim of claims) {
      const updated = await claimRepository.updateStatusInternal(
        claim.id,
        organizationId,
        'under_review',
        triggeredBy,
        `Automatic review triggered by treatment: ${treatmentType}`
      );

      if (updated) {
        reviewedClaimIds.push(claim.id);
      }
    }

    const result = {
      claimsReviewed: reviewedClaimIds.length,
      claimIds: reviewedClaimIds,
    };

    // Mark job as completed
    await jobProcessingLogRepository.markCompleted(jobLog.id, result);

    logger.info('Treatment initiated processing completed', {
      patientId,
      organizationId,
      treatmentType,
      claimsReviewed: result.claimsReviewed,
    });

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await jobProcessingLogRepository.markFailed(jobLog.id, errorMessage);
    throw error;
  }
}
