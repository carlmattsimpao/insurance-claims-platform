import { Router } from 'express';
import * as healthController from '../controllers/health.controller.js';
import { asyncHandler } from '../middleware/index.js';

const router = Router();

/**
 * GET /health
 * Basic health check
 */
router.get('/', asyncHandler(healthController.healthCheck));

/**
 * GET /health/detailed
 * Detailed health check with service status
 */
router.get('/detailed', asyncHandler(healthController.detailedHealthCheck));

/**
 * GET /ready
 * Kubernetes readiness probe
 */
router.get('/ready', asyncHandler(healthController.readinessCheck));

/**
 * GET /live
 * Kubernetes liveness probe
 */
router.get('/live', healthController.livenessCheck);

export default router;
