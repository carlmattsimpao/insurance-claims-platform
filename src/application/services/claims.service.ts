import {
  claimRepository,
  patientRepository,
  providerRepository,
} from '../../infrastructure/database/repositories/index.js';
import type { Claim } from '../../domain/entities/index.js';
import type {
  TenantContext,
  ClaimStatus,
  PaginatedResult,
} from '../../shared/types/index.js';
import type { ClaimFilters, ClaimSortField } from '../../domain/repositories/index.js';
import {
  NotFoundError,
  ForbiddenError,
  InvalidDiagnosisCodeError,
  InvalidClaimAmountError,
} from '../../domain/errors/index.js';
import {
  VALID_DIAGNOSIS_CODES,
  CLAIM_AMOUNT_CONSTRAINTS,
} from '../../domain/entities/index.js';
import type { CreateClaimInput, ListClaimsQuery, BulkStatusUpdateInput, UpdateClaimStatusInput } from '../validators/index.js';
import { logger } from '../../shared/utils/logger.js';

export class ClaimsService {
  /**
   * Create a new claim
   */
  async createClaim(
    input: CreateClaimInput,
    context: TenantContext
  ): Promise<Claim> {
    // Validate diagnosis code
    if (!VALID_DIAGNOSIS_CODES.includes(input.diagnosisCode as typeof VALID_DIAGNOSIS_CODES[number])) {
      throw new InvalidDiagnosisCodeError(input.diagnosisCode);
    }

    // Validate amount
    if (
      input.amount < CLAIM_AMOUNT_CONSTRAINTS.MIN ||
      input.amount > CLAIM_AMOUNT_CONSTRAINTS.MAX
    ) {
      throw new InvalidClaimAmountError(
        input.amount,
        CLAIM_AMOUNT_CONSTRAINTS.MIN,
        CLAIM_AMOUNT_CONSTRAINTS.MAX
      );
    }

    // Verify patient exists in the same organization
    const patientExists = await patientRepository.exists(input.patientId, context);
    if (!patientExists) {
      throw new NotFoundError('Patient', input.patientId);
    }

    // Verify provider exists in the same organization
    const providerExists = await providerRepository.exists(input.providerId, context);
    if (!providerExists) {
      throw new NotFoundError('Provider', input.providerId);
    }

    // For providers, ensure they're creating claims for themselves
    if (context.role === 'provider' && input.providerId !== context.providerId) {
      throw new ForbiddenError('Providers can only create claims for themselves');
    }

    const claim = await claimRepository.create(
      {
        ...input,
        organizationId: context.organizationId,
        status: 'submitted',
        submittedAt: new Date(),
      },
      context
    );

    logger.info('Claim created', {
      claimId: claim.id,
      claimNumber: claim.claimNumber,
      organizationId: context.organizationId,
      createdBy: context.userId,
    });

    return claim;
  }

  /**
   * Get a claim by ID
   */
  async getClaimById(id: string, context: TenantContext): Promise<Claim> {
    const claim = await claimRepository.findById(id, context);

    if (!claim) {
      throw new NotFoundError('Claim', id);
    }

    return claim;
  }

  /**
   * Get a claim by ID (alias for controller)
   */
  async getClaim(id: string, context: TenantContext): Promise<Claim> {
    return this.getClaimById(id, context);
  }

  /**
   * Get a claim by claim number
   */
  async getClaimByNumber(
    claimNumber: string,
    context: TenantContext
  ): Promise<Claim> {
    const claim = await claimRepository.findByClaimNumber(claimNumber, context);

    if (!claim) {
      throw new NotFoundError('Claim', claimNumber);
    }

    return claim;
  }

  /**
   * List claims with filtering, sorting, and pagination
   */
  async listClaims(
    query: ListClaimsQuery,
    context: TenantContext
  ): Promise<PaginatedResult<Claim>> {
    const { sortBy, sortOrder, limit, offset, ...filters } = query;

    const claimFilters: ClaimFilters = {
      fromDate: filters.fromDate,
      toDate: filters.toDate,
      status: filters.status as ClaimStatus | ClaimStatus[],
      patientId: filters.patientId,
      providerId: filters.providerId,
      minAmount: filters.minAmount,
      maxAmount: filters.maxAmount,
    };

    const sort: ClaimSortField = {
      field: sortBy,
      order: sortOrder,
    };

    return await claimRepository.findMany(context, {
      filters: claimFilters,
      sort,
      pagination: { limit, offset },
    });
  }

  /**
   * Update claim status
   */
  async updateClaimStatus(
    id: string,
    input: UpdateClaimStatusInput,
    context: TenantContext
  ): Promise<Claim> {
    const { status, reason } = input;
    
    const updatedClaim = await claimRepository.updateStatus(
      id,
      status,
      context,
      reason
    );

    if (!updatedClaim) {
      throw new NotFoundError('Claim', id);
    }

    logger.info('Claim status updated', {
      claimId: id,
      newStatus: status,
      organizationId: context.organizationId,
      updatedBy: context.userId,
      reason,
    });

    return updatedClaim;
  }

  /**
   * Bulk update claim status
   */
  async bulkUpdateStatus(
    input: BulkStatusUpdateInput,
    context: TenantContext
  ): Promise<{ updated: string[]; failed: { id: string; reason: string }[] }> {
    const { claimIds, status, reason } = input;

    const result = await claimRepository.bulkUpdateStatus(
      claimIds,
      status,
      context,
      reason
    );

    const failed: { id: string; reason: string }[] = result.failed.map(id => ({
      id,
      reason: 'Failed to update or access denied',
    }));

    logger.info('Bulk status update completed', {
      totalRequested: claimIds.length,
      updated: result.updated.length,
      failed: result.failed.length,
      organizationId: context.organizationId,
      updatedBy: context.userId,
    });

    return { updated: result.updated, failed };
  }

  /**
   * Assign claim to a processor
   */
  async assignClaimToProcessor(
    claimId: string,
    processorId: string,
    context: TenantContext
  ): Promise<Claim> {
    const claim = await claimRepository.assignToProcessor(
      claimId,
      processorId,
      context
    );

    if (!claim) {
      throw new NotFoundError('Claim', claimId);
    }

    logger.info('Claim assigned to processor', {
      claimId,
      processorId,
      organizationId: context.organizationId,
      assignedBy: context.userId,
    });

    return claim;
  }

  /**
   * Get claim count for dashboard/stats
   */
  async getClaimCount(
    context: TenantContext,
    filters?: ClaimFilters
  ): Promise<number> {
    return await claimRepository.count(context, filters);
  }

  /**
   * Get claim statistics
   */
  async getClaimStats(
    context: TenantContext
  ): Promise<{
    total: number;
    byStatus: Record<string, number>;
    totalAmount: number;
  }> {
    const total = await claimRepository.count(context);
    
    // Get counts by status
    const statuses: ClaimStatus[] = ['submitted', 'under_review', 'approved', 'rejected', 'paid'];
    const byStatus: Record<string, number> = {};
    
    for (const status of statuses) {
      byStatus[status] = await claimRepository.count(context, { status });
    }

    // Get total amount (sum of all claims)
    const totalAmount = await claimRepository.sumAmount(context);

    return {
      total,
      byStatus,
      totalAmount,
    };
  }
}

export const claimsService = new ClaimsService();
