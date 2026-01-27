import type { Request, Response } from 'express';
import { authService } from '../../infrastructure/auth/auth.service.js';
import type { ApiResponse } from '../../shared/types/index.js';
import type { User } from '../../domain/entities/index.js';
import type { LoginInput, RegisterInput } from '../../application/validators/index.js';

// User response type (without password hash)
type UserResponse = Omit<User, 'passwordHash'>;

function sanitizeUser(user: User): UserResponse {
  const { passwordHash, ...safeUser } = user;
  return safeUser;
}

/**
 * Login user
 * POST /api/auth/login
 */
export async function login(
  req: Request<unknown, unknown, LoginInput>,
  res: Response<ApiResponse<{
    user: UserResponse;
    accessToken: string;
    expiresIn: string;
  }>>
): Promise<void> {
  const { email, password } = req.body;
  const { user, tokens } = await authService.login(email, password);

  res.status(200).json({
    success: true,
    data: {
      user: sanitizeUser(user),
      accessToken: tokens.accessToken,
      expiresIn: tokens.expiresIn,
    },
    meta: {
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * Register new user
 * POST /api/auth/register
 */
export async function register(
  req: Request<unknown, unknown, RegisterInput>,
  res: Response<ApiResponse<{
    user: UserResponse;
    accessToken: string;
    expiresIn: string;
  }>>
): Promise<void> {
  const { email, password, firstName, lastName, organizationCode, role } = req.body;
  
  const { user, tokens } = await authService.register(
    email,
    password,
    firstName,
    lastName,
    organizationCode,
    role
  );

  res.status(201).json({
    success: true,
    data: {
      user: sanitizeUser(user),
      accessToken: tokens.accessToken,
      expiresIn: tokens.expiresIn,
    },
    meta: {
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * Get current user profile
 * GET /api/auth/me
 */
export async function getCurrentUser(
  req: Request,
  res: Response<ApiResponse<{
    user: UserResponse;
    tenantContext: {
      organizationId: string;
      role: string;
    };
  }>>
): Promise<void> {
  const context = req.tenantContext!;
  
  // Import user repository to get full user data
  const { userRepository } = await import('../../infrastructure/database/repositories/index.js');
  const user = await userRepository.findById(context.userId);

  if (!user) {
    throw new Error('User not found');
  }

  res.status(200).json({
    success: true,
    data: {
      user: sanitizeUser(user),
      tenantContext: {
        organizationId: context.organizationId,
        role: context.role,
      },
    },
    meta: {
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * Refresh token (get new access token)
 * POST /api/auth/refresh
 */
export async function refreshToken(
  req: Request,
  res: Response<ApiResponse<{
    accessToken: string;
    expiresIn: string;
  }>>
): Promise<void> {
  // User is already authenticated via middleware
  const jwtPayload = req.jwtPayload!;

  const tokens = authService.generateToken(jwtPayload);

  res.status(200).json({
    success: true,
    data: {
      accessToken: tokens.accessToken,
      expiresIn: tokens.expiresIn,
    },
    meta: {
      timestamp: new Date().toISOString(),
    },
  });
}
