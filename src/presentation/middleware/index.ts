export {
  authenticate,
  requireRoles,
  requireAdmin,
  requireClaimsAccess,
  requireProvider,
  requireAuthenticated,
  optionalAuth,
} from './auth.middleware.js';

export {
  errorHandler,
  notFoundHandler,
  asyncHandler,
} from './error.middleware.js';

export {
  validateBody,
  validateQuery,
  validateParams,
} from './validation.middleware.js';

export {
  rateLimit,
  authRateLimit,
  bulkOperationRateLimit,
} from './rate-limit.middleware.js';
