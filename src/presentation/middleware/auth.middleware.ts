import type { Request, Response, NextFunction } from 'express';
import { authService, type JwtPayload } from '../../infrastructure/auth/auth.service.js';
import type { TenantContext, UserRole } from '../../shared/types/index.js';
import { UnauthorizedError, ForbiddenError } from '../../domain/errors/index.js';

// Extend Express Request to include tenant context
declare global {
  namespace Express {
    interface Request {
      tenantContext?: TenantContext;
      jwtPayload?: JwtPayload;
    }
  }
}

/**
 * Extract JWT token from Authorization header
 */
function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return null;
  }

  const [scheme, token] = authHeader.split(' ');
  
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return null;
  }

  return token;
}

/**
 * Authenticate request and populate tenant context
 * This middleware MUST be applied to all protected routes
 */
export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = extractToken(req);

    if (!token) {
      throw new UnauthorizedError('No authentication token provided');
    }

    // Verify JWT and get payload
    const jwtPayload = authService.verifyToken(token);
    req.jwtPayload = jwtPayload;

    // Get full tenant context (includes fresh assigned claims for processors)
    const tenantContext = await authService.getTenantContext(jwtPayload);
    req.tenantContext = tenantContext;

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Require specific roles for a route
 * Must be used AFTER authenticate middleware
 */
export function requireRoles(...allowedRoles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const context = req.tenantContext;

    if (!context) {
      throw new UnauthorizedError('Authentication required');
    }

    if (!allowedRoles.includes(context.role)) {
      throw new ForbiddenError(
        `Access denied. Required roles: ${allowedRoles.join(', ')}`
      );
    }

    next();
  };
}

/**
 * Require admin role
 */
export const requireAdmin = requireRoles('admin');

/**
 * Require admin or claims processor role
 */
export const requireClaimsAccess = requireRoles('admin', 'claims_processor');

/**
 * Require provider role
 */
export const requireProvider = requireRoles('admin', 'provider');

/**
 * Allow any authenticated user
 */
export const requireAuthenticated = requireRoles(
  'admin',
  'claims_processor',
  'provider',
  'patient'
);

/**
 * Optional authentication - populates context if token provided, but doesn't fail
 */
export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = extractToken(req);

    if (token) {
      const jwtPayload = authService.verifyToken(token);
      req.jwtPayload = jwtPayload;
      const tenantContext = await authService.getTenantContext(jwtPayload);
      req.tenantContext = tenantContext;
    }

    next();
  } catch {
    // Token invalid, continue without context
    next();
  }
}
