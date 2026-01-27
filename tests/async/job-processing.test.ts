import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  processPatientAdmission,
  processPatientDischarge,
  processTreatmentInitiated,
} from '../../src/infrastructure/queue/jobs/claim-jobs.js';
import type {
  PatientAdmissionJobData,
  PatientDischargeJobData,
  TreatmentInitiatedJobData,
} from '../../src/shared/types/index.js';

// Mock repositories
vi.mock('../../src/infrastructure/database/repositories/index.js', () => ({
  claimRepository: {
    findByPatientIdInternal: vi.fn(),
    updateStatusInternal: vi.fn(),
  },
  jobProcessingLogRepository: {
    findByIdempotencyKey: vi.fn(),
    create: vi.fn(),
    markCompleted: vi.fn(),
    markFailed: vi.fn(),
  },
}));

import {
  claimRepository,
  jobProcessingLogRepository,
} from '../../src/infrastructure/database/repositories/index.js';

const mockedClaimRepo = vi.mocked(claimRepository);
const mockedJobLogRepo = vi.mocked(jobProcessingLogRepository);

describe('Async Job Processing - Idempotency Tests', () => {
  const baseJobData: PatientAdmissionJobData = {
    organizationId: 'org-1',
    patientId: 'patient-1',
    idempotencyKey: 'admission-patient-1-12345',
    triggeredBy: 'system',
    jobId: 'job-1',
  };

  const mockClaims = [
    {
      id: 'claim-1',
      organizationId: 'org-1',
      status: 'submitted' as const,
      claimNumber: 'CLM-001',
      patientId: 'patient-1',
      providerId: 'provider-1',
      diagnosisCode: 'J06.9',
      amount: 150.00,
      serviceDate: new Date(),
      submittedAt: new Date(),
      statusHistory: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'claim-2',
      organizationId: 'org-1',
      status: 'submitted' as const,
      claimNumber: 'CLM-002',
      patientId: 'patient-1',
      providerId: 'provider-1',
      diagnosisCode: 'J18.9',
      amount: 200.00,
      serviceDate: new Date(),
      submittedAt: new Date(),
      statusHistory: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('processPatientAdmission', () => {
    it('should process claims on first run', async () => {
      // No existing job log (first run)
      mockedJobLogRepo.findByIdempotencyKey.mockResolvedValue(null);
      mockedJobLogRepo.create.mockResolvedValue({
        id: 'log-1',
        organizationId: 'org-1',
        jobId: 'job-1',
        jobType: 'patient_admission',
        idempotencyKey: baseJobData.idempotencyKey,
        status: 'processing',
        payload: baseJobData as unknown as Record<string, unknown>,
        startedAt: new Date(),
        retryCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockedClaimRepo.findByPatientIdInternal.mockResolvedValue(mockClaims);
      mockedClaimRepo.updateStatusInternal.mockImplementation(async (claimId) => {
        const claim = mockClaims.find(c => c.id === claimId);
        return claim ? { ...claim, status: 'under_review' as const } : null;
      });

      const result = await processPatientAdmission(baseJobData);

      expect(result.claimsUpdated).toBe(2);
      expect(result.claimIds).toEqual(['claim-1', 'claim-2']);
      expect(mockedJobLogRepo.markCompleted).toHaveBeenCalledWith('log-1', result);
    });

    it('should return cached result on duplicate run (idempotency)', async () => {
      const cachedResult = {
        claimsUpdated: 2,
        claimIds: ['claim-1', 'claim-2'],
      };

      // Existing completed job log
      mockedJobLogRepo.findByIdempotencyKey.mockResolvedValue({
        id: 'log-1',
        organizationId: 'org-1',
        jobId: 'job-1',
        jobType: 'patient_admission',
        idempotencyKey: baseJobData.idempotencyKey,
        status: 'completed',
        payload: baseJobData as unknown as Record<string, unknown>,
        result: cachedResult,
        startedAt: new Date(),
        completedAt: new Date(),
        retryCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await processPatientAdmission(baseJobData);

      // Should return cached result
      expect(result).toEqual(cachedResult);

      // Should NOT process claims again
      expect(mockedClaimRepo.findByPatientIdInternal).not.toHaveBeenCalled();
      expect(mockedClaimRepo.updateStatusInternal).not.toHaveBeenCalled();
    });

    it('should handle failure and mark job as failed', async () => {
      mockedJobLogRepo.findByIdempotencyKey.mockResolvedValue(null);
      mockedJobLogRepo.create.mockResolvedValue({
        id: 'log-1',
        organizationId: 'org-1',
        jobId: 'job-1',
        jobType: 'patient_admission',
        idempotencyKey: baseJobData.idempotencyKey,
        status: 'processing',
        payload: baseJobData as unknown as Record<string, unknown>,
        startedAt: new Date(),
        retryCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Simulate database error
      mockedClaimRepo.findByPatientIdInternal.mockRejectedValue(
        new Error('Database connection failed')
      );

      await expect(processPatientAdmission(baseJobData)).rejects.toThrow(
        'Database connection failed'
      );

      expect(mockedJobLogRepo.markFailed).toHaveBeenCalledWith(
        'log-1',
        'Database connection failed'
      );
    });
  });

  describe('processPatientDischarge', () => {
    const dischargeData: PatientDischargeJobData = {
      organizationId: 'org-1',
      patientId: 'patient-1',
      idempotencyKey: 'discharge-patient-1-12345',
      triggeredBy: 'system',
      jobId: 'job-2',
    };

    it('should auto-approve claims on discharge', async () => {
      mockedJobLogRepo.findByIdempotencyKey.mockResolvedValue(null);
      mockedJobLogRepo.create.mockResolvedValue({
        id: 'log-2',
        organizationId: 'org-1',
        jobId: 'job-2',
        jobType: 'patient_discharge',
        idempotencyKey: dischargeData.idempotencyKey,
        status: 'processing',
        payload: dischargeData as unknown as Record<string, unknown>,
        startedAt: new Date(),
        retryCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const underReviewClaims = mockClaims.map(c => ({
        ...c,
        status: 'under_review' as const,
      }));

      mockedClaimRepo.findByPatientIdInternal.mockResolvedValue(underReviewClaims);
      mockedClaimRepo.updateStatusInternal.mockImplementation(async (claimId) => {
        const claim = underReviewClaims.find(c => c.id === claimId);
        return claim ? { ...claim, status: 'approved' as const } : null;
      });

      const result = await processPatientDischarge(dischargeData);

      expect(result.claimsApproved).toBe(2);
      expect(mockedClaimRepo.updateStatusInternal).toHaveBeenCalledWith(
        'claim-1',
        'org-1',
        'approved',
        'system',
        'Auto-approved upon patient discharge'
      );
    });
  });

  describe('processTreatmentInitiated', () => {
    const treatmentData: TreatmentInitiatedJobData = {
      organizationId: 'org-1',
      patientId: 'patient-1',
      idempotencyKey: 'treatment-patient-1-12345',
      triggeredBy: 'system',
      jobId: 'job-3',
      treatmentType: 'Surgery',
    };

    it('should move claims to under_review on treatment initiation', async () => {
      mockedJobLogRepo.findByIdempotencyKey.mockResolvedValue(null);
      mockedJobLogRepo.create.mockResolvedValue({
        id: 'log-3',
        organizationId: 'org-1',
        jobId: 'job-3',
        jobType: 'treatment_initiated',
        idempotencyKey: treatmentData.idempotencyKey,
        status: 'processing',
        payload: treatmentData as unknown as Record<string, unknown>,
        startedAt: new Date(),
        retryCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockedClaimRepo.findByPatientIdInternal.mockResolvedValue(mockClaims);
      mockedClaimRepo.updateStatusInternal.mockImplementation(async (claimId) => {
        const claim = mockClaims.find(c => c.id === claimId);
        return claim ? { ...claim, status: 'under_review' as const } : null;
      });

      const result = await processTreatmentInitiated(treatmentData);

      expect(result.claimsReviewed).toBe(2);
      expect(mockedClaimRepo.updateStatusInternal).toHaveBeenCalledWith(
        'claim-1',
        'org-1',
        'under_review',
        'system',
        'Automatic review triggered by treatment: Surgery'
      );
    });
  });
});

describe('Async Job Processing - Concurrent Execution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle concurrent job execution with same idempotency key', async () => {
    const jobData: PatientAdmissionJobData = {
      organizationId: 'org-1',
      patientId: 'patient-1',
      idempotencyKey: 'concurrent-test-key',
      triggeredBy: 'system',
      jobId: 'job-concurrent',
    };

    // Simulate race condition: first call creates log, second sees it in progress
    let callCount = 0;
    mockedJobLogRepo.findByIdempotencyKey.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return null; // First call: no existing log
      }
      // Second call: log exists but still processing
      return {
        id: 'log-concurrent',
        organizationId: 'org-1',
        jobId: 'job-concurrent',
        jobType: 'patient_admission',
        idempotencyKey: jobData.idempotencyKey,
        status: 'processing', // Still in progress
        payload: jobData as unknown as Record<string, unknown>,
        startedAt: new Date(),
        retryCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    });

    mockedJobLogRepo.create.mockResolvedValue({
      id: 'log-concurrent',
      organizationId: 'org-1',
      jobId: 'job-concurrent',
      jobType: 'patient_admission',
      idempotencyKey: jobData.idempotencyKey,
      status: 'processing',
      payload: jobData as unknown as Record<string, unknown>,
      startedAt: new Date(),
      retryCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockedClaimRepo.findByPatientIdInternal.mockResolvedValue([]);
    
    // First execution
    const result1 = await processPatientAdmission(jobData);
    expect(result1.claimsUpdated).toBe(0);

    // Second execution (would see existing log)
    const result2 = await processPatientAdmission(jobData);
    expect(result2.claimsUpdated).toBe(0);

    // Both executions complete without error
    expect(mockedJobLogRepo.markCompleted).toHaveBeenCalledTimes(2);
  });
});

describe('Async Job Processing - Partial Failure Recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle partial failure and recover on retry', async () => {
    const jobData: PatientAdmissionJobData = {
      organizationId: 'org-1',
      patientId: 'patient-1',
      idempotencyKey: 'partial-failure-key',
      triggeredBy: 'system',
      jobId: 'job-partial',
    };

    const claims = [
      { id: 'claim-1', organizationId: 'org-1', status: 'submitted' as const },
      { id: 'claim-2', organizationId: 'org-1', status: 'submitted' as const },
      { id: 'claim-3', organizationId: 'org-1', status: 'submitted' as const },
    ].map(c => ({
      ...c,
      claimNumber: `CLM-${c.id}`,
      patientId: 'patient-1',
      providerId: 'provider-1',
      diagnosisCode: 'J06.9',
      amount: 100.00,
      serviceDate: new Date(),
      submittedAt: new Date(),
      statusHistory: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    // First attempt: fails after updating first claim
    let attemptCount = 0;
    mockedJobLogRepo.findByIdempotencyKey.mockImplementation(async () => {
      attemptCount++;
      if (attemptCount === 1) return null;
      // On retry, job log exists but failed
      return {
        id: 'log-partial',
        organizationId: 'org-1',
        jobId: 'job-partial',
        jobType: 'patient_admission',
        idempotencyKey: jobData.idempotencyKey,
        status: 'failed',
        payload: jobData as unknown as Record<string, unknown>,
        startedAt: new Date(),
        error: 'Network error',
        retryCount: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    });

    mockedJobLogRepo.create.mockResolvedValue({
      id: 'log-partial',
      organizationId: 'org-1',
      jobId: 'job-partial',
      jobType: 'patient_admission',
      idempotencyKey: jobData.idempotencyKey,
      status: 'processing',
      payload: jobData as unknown as Record<string, unknown>,
      startedAt: new Date(),
      retryCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // On retry, some claims may already be updated
    mockedClaimRepo.findByPatientIdInternal.mockImplementation(async () => {
      if (attemptCount === 1) {
        return claims;
      }
      // On retry, claim-1 is already under_review
      return [
        { ...claims[0], status: 'under_review' as const },
        claims[1],
        claims[2],
      ];
    });

    let updateCallCount = 0;
    mockedClaimRepo.updateStatusInternal.mockImplementation(async (claimId) => {
      updateCallCount++;
      if (attemptCount === 1 && updateCallCount === 2) {
        throw new Error('Network error');
      }
      const claim = claims.find(c => c.id === claimId);
      return claim ? { ...claim, status: 'under_review' as const } : null;
    });

    // First attempt fails
    await expect(processPatientAdmission(jobData)).rejects.toThrow('Network error');
    expect(mockedJobLogRepo.markFailed).toHaveBeenCalled();

    // Reset for retry
    updateCallCount = 0;
    mockedClaimRepo.updateStatusInternal.mockImplementation(async (claimId) => {
      const claim = claims.find(c => c.id === claimId);
      return claim ? { ...claim, status: 'under_review' as const } : null;
    });

    // Retry succeeds (job log shows failed, so we retry)
    const result = await processPatientAdmission(jobData);
    
    // Should complete successfully
    expect(result.claimsUpdated).toBeGreaterThan(0);
  });
});
