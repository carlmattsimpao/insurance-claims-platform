import { Router } from 'express';
import * as claimsController from '../controllers/claims.controller.js';
import {
  authenticate,
  requireAuthenticated,
  requireClaimsAccess,
  asyncHandler,
  validateBody,
  validateQuery,
  bulkOperationRateLimit,
  rateLimit,
} from '../middleware/index.js';
import {
  createClaimSchema,
  listClaimsQuerySchema,
  updateClaimStatusSchema,
  bulkStatusUpdateSchema,
} from '../../application/validators/index.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Apply general rate limiting
router.use(rateLimit());

/**
 * POST /api/claims
 * Create a new claim
 * Allowed: admin, claims_processor, provider
 */
router.post(
  '/',
  requireClaimsAccess,
  validateBody(createClaimSchema),
  asyncHandler(claimsController.createClaim)
);

/**
 * GET /api/claims
 * List claims with filtering and pagination
 * Allowed: all authenticated users (filtered by role)
 */
router.get(
  '/',
  requireAuthenticated,
  validateQuery(listClaimsQuerySchema),
  asyncHandler(claimsController.listClaims)
);

/**
 * GET /api/claims/stats
 * Get claim statistics
 * Allowed: admin, claims_processor
 */
router.get(
  '/stats',
  requireClaimsAccess,
  asyncHandler(claimsController.getClaimStats)
);

/**
 * GET /api/claims/:id
 * Get a single claim
 * Allowed: all authenticated users (access controlled by service)
 */
router.get(
  '/:id',
  requireAuthenticated,
  asyncHandler(claimsController.getClaim)
);

/**
 * PATCH /api/claims/:id
 * Update claim status
 * Allowed: admin, claims_processor (must be assigned)
 */
router.patch(
  '/:id',
  requireClaimsAccess,
  validateBody(updateClaimStatusSchema),
  asyncHandler(claimsController.updateClaimStatus)
);

/**
 * POST /api/claims/bulk-status-update
 * Bulk update claim statuses
 * Allowed: admin, claims_processor
 */
router.post(
  '/bulk-status-update',
  requireClaimsAccess,
  bulkOperationRateLimit,
  validateBody(bulkStatusUpdateSchema),
  asyncHandler(claimsController.bulkUpdateStatus)
);

export default router;
