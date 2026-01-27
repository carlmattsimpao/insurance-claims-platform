import { Router } from 'express';
import * as patientStatusController from '../controllers/patient-status.controller.js';
import {
  authenticate,
  requireAuthenticated,
  requireClaimsAccess,
  asyncHandler,
  validateBody,
  rateLimit,
} from '../middleware/index.js';
import { createPatientStatusSchema } from '../../application/validators/index.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Apply general rate limiting
router.use(rateLimit());

/**
 * POST /api/patient-status
 * Create a patient status change event
 * Allowed: admin, claims_processor
 * This triggers background job processing
 */
router.post(
  '/',
  requireClaimsAccess,
  validateBody(createPatientStatusSchema),
  asyncHandler(patientStatusController.createStatusEvent)
);

/**
 * GET /api/patient-status/history/:patientId
 * Get patient status history
 * Allowed: all authenticated users (filtered by role)
 */
router.get(
  '/history/:patientId',
  requireAuthenticated,
  asyncHandler(patientStatusController.getPatientHistory)
);

/**
 * GET /api/patient-status/:id
 * Get a single status event
 * Allowed: all authenticated users (filtered by role)
 */
router.get(
  '/:id',
  requireAuthenticated,
  asyncHandler(patientStatusController.getStatusEvent)
);

export default router;
