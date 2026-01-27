import { Router } from 'express';
import * as authController from '../controllers/auth.controller.js';
import {
  authenticate,
  asyncHandler,
  validateBody,
  authRateLimit,
} from '../middleware/index.js';
import { loginSchema, registerSchema } from '../../application/validators/index.js';

const router = Router();

/**
 * POST /api/auth/login
 * Login with email and password
 * Public endpoint with stricter rate limiting
 */
router.post(
  '/login',
  authRateLimit,
  validateBody(loginSchema),
  asyncHandler(authController.login)
);

/**
 * POST /api/auth/register
 * Register a new user
 * Public endpoint with stricter rate limiting
 */
router.post(
  '/register',
  authRateLimit,
  validateBody(registerSchema),
  asyncHandler(authController.register)
);

/**
 * GET /api/auth/me
 * Get current user profile
 * Requires authentication
 */
router.get(
  '/me',
  authenticate,
  asyncHandler(authController.getCurrentUser)
);

/**
 * POST /api/auth/refresh
 * Refresh access token
 * Requires authentication
 */
router.post(
  '/refresh',
  authenticate,
  asyncHandler(authController.refreshToken)
);

export default router;
