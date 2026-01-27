import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { claimsService } from '../../src/application/services/claims.service.js';
import type { TenantContext } from '../../src/shared/types/index.js';
import { ForbiddenError, NotFoundError, InvalidDiagnosisCodeError } from '../../src/domain/errors/index.js';

// Mock repositories
vi.mock('../../src/infrastructure/database/repositories/index.js', () => ({
  claimRepository: {
    create: vi.fn(),
    findById: vi.fn(),
    findMany: vi.fn(),
    findByFilters: vi.fn(),
    updateStatus: vi.fn(),
    getStatsByStatus: vi.fn(),
  },
  patientRepository: {
    exists: vi.fn(),
    findById: vi.fn(),
  },
  providerRepository: {
    exists: vi.fn(),
    findById: vi.fn(),
  },
}));

import {
  claimRepository,
  patientRepository,
  providerRepository,
} from '../../src/infrastructure/database/repositories/index.js';

const mockedClaimRepo = vi.mocked(claimRepository);
const mockedPatientRepo = vi.mocked(patientRepository);
const mockedProviderRepo = vi.mocked(providerRepository);

describe('ClaimsService Integration Tests', () => {
  const adminContext: TenantContext = {
    organizationId: 'org-1',
    userId: 'admin-user-1',
    role: 'admin',
  };

  const processorContext: TenantContext = {
    organizationId: 'org-1',
    userId: 'processor-user-1',
    role: 'claims_processor',
    assignedClaimIds: ['claim-1', 'claim-2'],
  };

  const providerContext: TenantContext = {
    organizationId: 'org-1',
    userId: 'provider-user-1',
    role: 'provider',
    providerId: 'provider-1',
  };

  const patientContext: TenantContext = {
    organizationId: 'org-1',
    userId: 'patient-user-1',
    role: 'patient',
    patientId: 'patient-1',
  };

  const mockClaim = {
    id: 'claim-1',
    organizationId: 'org-1',
    claimNumber: 'CLM-001',
    patientId: 'patient-1',
    providerId: 'provider-1',
    diagnosisCode: 'J06.9',
    amount: 150.00,
    status: 'submitted' as const,
    serviceDate: new Date(),
    submittedAt: new Date(),
    statusHistory: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createClaim', () => {
    it('should create a claim successfully for admin', async () => {
      mockedPatientRepo.exists.mockResolvedValue(true);
      mockedProviderRepo.exists.mockResolvedValue(true);
      mockedClaimRepo.create.mockResolvedValue(mockClaim);

      const input = {
        patientId: 'patient-1',
        providerId: 'provider-1',
        diagnosisCode: 'J06.9' as const,
        amount: 150.00,
        serviceDate: new Date(),
      };

      const result = await claimsService.createClaim(input, adminContext);

      expect(result).toEqual(mockClaim);
      expect(mockedPatientRepo.exists).toHaveBeenCalledWith('patient-1', adminContext);
      expect(mockedProviderRepo.exists).toHaveBeenCalledWith('provider-1', adminContext);
      expect(mockedClaimRepo.create).toHaveBeenCalled();
    });

    it('should reject invalid diagnosis code', async () => {
      const input = {
        patientId: 'patient-1',
        providerId: 'provider-1',
        diagnosisCode: 'INVALID' as any,
        amount: 150.00,
        serviceDate: new Date(),
      };

      await expect(claimsService.createClaim(input, adminContext))
        .rejects.toThrow(InvalidDiagnosisCodeError);
    });

    it('should reject if patient not found', async () => {
      mockedPatientRepo.exists.mockResolvedValue(false);

      const input = {
        patientId: 'patient-1',
        providerId: 'provider-1',
        diagnosisCode: 'J06.9' as const,
        amount: 150.00,
        serviceDate: new Date(),
      };

      await expect(claimsService.createClaim(input, adminContext))
        .rejects.toThrow(NotFoundError);
    });

    it('should allow provider to create claim only for themselves', async () => {
      mockedPatientRepo.exists.mockResolvedValue(true);
      mockedProviderRepo.exists.mockResolvedValue(true);
      mockedClaimRepo.create.mockResolvedValue(mockClaim);

      const input = {
        patientId: 'patient-1',
        providerId: 'provider-1', // matches providerContext.providerId
        diagnosisCode: 'J06.9' as const,
        amount: 150.00,
        serviceDate: new Date(),
      };

      const result = await claimsService.createClaim(input, providerContext);
      expect(result).toEqual(mockClaim);
    });

    it('should prevent provider from creating claim for another provider', async () => {
      const input = {
        patientId: 'patient-1',
        providerId: 'other-provider', // different from providerContext.providerId
        diagnosisCode: 'J06.9' as const,
        amount: 150.00,
        serviceDate: new Date(),
      };

      // Should throw before even checking if provider exists
      await expect(claimsService.createClaim(input, providerContext))
        .rejects.toThrow(ForbiddenError);
    });
  });

  describe('getClaim', () => {
    it('should return claim for admin', async () => {
      mockedClaimRepo.findById.mockResolvedValue(mockClaim);

      const result = await claimsService.getClaimById('claim-1', adminContext);

      expect(result).toEqual(mockClaim);
    });

    it('should throw NotFoundError for non-existent claim', async () => {
      mockedClaimRepo.findById.mockResolvedValue(null);

      await expect(claimsService.getClaimById('non-existent', adminContext))
        .rejects.toThrow(NotFoundError);
    });
  });

  describe('updateClaimStatus', () => {
    it('should update claim status for admin', async () => {
      const updatedClaim = { ...mockClaim, status: 'approved' as const };
      mockedClaimRepo.updateStatus.mockResolvedValue(updatedClaim);

      const result = await claimsService.updateClaimStatus(
        'claim-1',
        { status: 'approved' },
        adminContext
      );

      expect(result.status).toBe('approved');
    });

    it('should throw NotFoundError when claim not found', async () => {
      mockedClaimRepo.updateStatus.mockResolvedValue(null);

      await expect(
        claimsService.updateClaimStatus(
          'non-existent',
          { status: 'approved' },
          adminContext
        )
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('listClaims', () => {
    it('should return paginated results', async () => {
      const paginatedResult = {
        data: [mockClaim],
        pagination: {
          total: 1,
          limit: 20,
          offset: 0,
          hasMore: false,
        },
      };
      mockedClaimRepo.findMany.mockResolvedValue(paginatedResult);

      const result = await claimsService.listClaims(
        { limit: 20, offset: 0, sortBy: 'createdAt', sortOrder: 'desc' },
        adminContext
      );

      expect(result.data).toHaveLength(1);
      expect(result.pagination.total).toBe(1);
    });
  });
});

describe('Cross-Tenant Access Prevention', () => {
  const org1Context: TenantContext = {
    organizationId: 'org-1',
    userId: 'user-1',
    role: 'admin',
  };

  const org2Context: TenantContext = {
    organizationId: 'org-2',
    userId: 'user-2',
    role: 'admin',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should not return claims from different organization', async () => {
    const org1Claim = {
      id: 'claim-1',
      organizationId: 'org-1',
      claimNumber: 'CLM-001',
      patientId: 'patient-1',
      providerId: 'provider-1',
      diagnosisCode: 'J06.9',
      amount: 150.00,
      status: 'submitted' as const,
      serviceDate: new Date(),
      submittedAt: new Date(),
      statusHistory: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Repository returns claim only for matching org
    mockedClaimRepo.findById.mockImplementation(async (_id, context) => {
      if (context.organizationId === org1Claim.organizationId) {
        return org1Claim;
      }
      return null;
    });

    // Org-1 admin can access
    const result1 = await claimsService.getClaimById('claim-1', org1Context);
    expect(result1).toEqual(org1Claim);

    // Org-2 admin cannot access
    await expect(claimsService.getClaimById('claim-1', org2Context))
      .rejects.toThrow(NotFoundError);
  });
});

describe('Claims Processor Assignment Tests', () => {
  const processorWithAssignments: TenantContext = {
    organizationId: 'org-1',
    userId: 'processor-1',
    role: 'claims_processor',
    assignedClaimIds: ['claim-1', 'claim-2'],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should allow processor to update assigned claim', async () => {
    const assignedClaim = {
      id: 'claim-1',
      organizationId: 'org-1',
      status: 'approved' as const,
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
    };

    mockedClaimRepo.updateStatus.mockResolvedValue(assignedClaim);

    const result = await claimsService.updateClaimStatus(
      'claim-1',
      { status: 'approved' },
      processorWithAssignments
    );

    expect(result.status).toBe('approved');
  });

  it('should throw NotFoundError when processor tries to update unassigned claim', async () => {
    // Repository returns null because role filter excludes unassigned claims
    mockedClaimRepo.updateStatus.mockResolvedValue(null);

    await expect(
      claimsService.updateClaimStatus(
        'claim-3', // Not in assignedClaimIds
        { status: 'approved' },
        processorWithAssignments
      )
    ).rejects.toThrow(NotFoundError);
  });
});
