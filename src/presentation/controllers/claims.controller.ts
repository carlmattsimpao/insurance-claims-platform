import type { Request, Response } from 'express';
import { claimsService } from '../../application/services/claims.service.js';
import type { ApiResponse, PaginatedResult } from '../../shared/types/index.js';
import type { Claim } from '../../domain/entities/index.js';
import type {
  CreateClaimInput,
  ListClaimsQuery,
  UpdateClaimStatusInput,
  BulkStatusUpdateInput,
} from '../../application/validators/index.js';

/**
 * Create a new claim
 * POST /api/claims
 */
export async function createClaim(
  req: Request<unknown, unknown, CreateClaimInput>,
  res: Response<ApiResponse<Claim>>
): Promise<void> {
  const claim = await claimsService.createClaim(req.body, req.tenantContext!);

  res.status(201).json({
    success: true,
    data: claim,
    meta: {
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * List claims with filtering and pagination
 * GET /api/claims
 */
export async function listClaims(
  req: Request<unknown, unknown, unknown, ListClaimsQuery>,
  res: Response<ApiResponse<PaginatedResult<Claim>>>
): Promise<void> {
  const result = await claimsService.listClaims(
    req.query as ListClaimsQuery,
    req.tenantContext!
  );

  res.status(200).json({
    success: true,
    data: result,
    meta: {
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * Get a single claim by ID
 * GET /api/claims/:id
 */
export async function getClaim(
  req: Request<{ id: string }>,
  res: Response<ApiResponse<Claim>>
): Promise<void> {
  const claim = await claimsService.getClaim(req.params.id, req.tenantContext!);

  res.status(200).json({
    success: true,
    data: claim,
    meta: {
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * Update claim status
 * PATCH /api/claims/:id
 */
export async function updateClaimStatus(
  req: Request<{ id: string }, unknown, UpdateClaimStatusInput>,
  res: Response<ApiResponse<Claim>>
): Promise<void> {
  const claim = await claimsService.updateClaimStatus(
    req.params.id,
    req.body,
    req.tenantContext!
  );

  res.status(200).json({
    success: true,
    data: claim,
    meta: {
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * Bulk update claim statuses
 * POST /api/claims/bulk-status-update
 */
export async function bulkUpdateStatus(
  req: Request<unknown, unknown, BulkStatusUpdateInput>,
  res: Response<ApiResponse<{
    updated: string[];
    failed: { id: string; reason: string }[];
  }>>
): Promise<void> {
  const result = await claimsService.bulkUpdateStatus(
    req.body,
    req.tenantContext!
  );

  res.status(200).json({
    success: true,
    data: result,
    meta: {
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * Get claim statistics for dashboard
 * GET /api/claims/stats
 */
export async function getClaimStats(
  req: Request,
  res: Response<ApiResponse<{
    total: number;
    byStatus: Record<string, number>;
    totalAmount: number;
  }>>
): Promise<void> {
  const stats = await claimsService.getClaimStats(req.tenantContext!);

  res.status(200).json({
    success: true,
    data: stats,
    meta: {
      timestamp: new Date().toISOString(),
    },
  });
}
