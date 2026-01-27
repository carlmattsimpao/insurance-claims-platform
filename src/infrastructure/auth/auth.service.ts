import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { env } from '../../config/env.js';
import { userRepository, organizationRepository } from '../database/repositories/index.js';
import type { User } from '../../domain/entities/index.js';
import type { TenantContext, UserRole } from '../../shared/types/index.js';
import { UnauthorizedError, NotFoundError, ValidationError } from '../../domain/errors/index.js';
import { logger } from '../../shared/utils/logger.js';

export interface JwtPayload {
  userId: string;
  email: string;
  organizationId: string;
  role: UserRole;
  providerId?: string;
  patientId?: string;
}

export interface AuthTokens {
  accessToken: string;
  expiresIn: string;
}

export class AuthService {
  private readonly SALT_ROUNDS = 12;

  /**
   * Hash a password
   */
  async hashPassword(password: string): Promise<string> {
    return await bcrypt.hash(password, this.SALT_ROUNDS);
  }

  /**
   * Compare password with hash
   */
  async comparePassword(password: string, hash: string): Promise<boolean> {
    return await bcrypt.compare(password, hash);
  }

  /**
   * Generate JWT token
   */
  generateToken(payload: JwtPayload): AuthTokens {
    const accessToken = jwt.sign(payload, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    });

    return {
      accessToken,
      expiresIn: env.JWT_EXPIRES_IN,
    };
  }

  /**
   * Verify and decode JWT token
   */
  verifyToken(token: string): JwtPayload {
    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedError('Token has expired');
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new UnauthorizedError('Invalid token');
      }
      throw new UnauthorizedError('Token verification failed');
    }
  }

  /**
   * Login user
   */
  async login(email: string, password: string): Promise<{ user: User; tokens: AuthTokens }> {
    const user = await userRepository.findByEmail(email);

    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    if (!user.isActive) {
      throw new UnauthorizedError('Account is deactivated');
    }

    const isPasswordValid = await this.comparePassword(password, user.passwordHash);

    if (!isPasswordValid) {
      throw new UnauthorizedError('Invalid email or password');
    }

    // Verify organization is active
    const org = await organizationRepository.findById(user.organizationId);
    if (!org || !org.isActive) {
      throw new UnauthorizedError('Organization is inactive');
    }

    const payload: JwtPayload = {
      userId: user.id,
      email: user.email,
      organizationId: user.organizationId,
      role: user.role,
      providerId: user.providerId,
      patientId: user.patientId,
    };

    const tokens = this.generateToken(payload);

    logger.info('User logged in', {
      userId: user.id,
      organizationId: user.organizationId,
      role: user.role,
    });

    return { user, tokens };
  }

  /**
   * Register a new user
   */
  async register(
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    organizationCode: string,
    role: UserRole = 'patient'
  ): Promise<{ user: User; tokens: AuthTokens }> {
    // Find organization by code
    const organization = await organizationRepository.findByCode(organizationCode);

    if (!organization) {
      throw new NotFoundError('Organization', organizationCode);
    }

    if (!organization.isActive) {
      throw new ValidationError('Organization is not active');
    }

    // Check if email already exists
    const existingUser = await userRepository.findByEmail(email);
    if (existingUser) {
      throw new ValidationError('Email already registered');
    }

    // Hash password
    const passwordHash = await this.hashPassword(password);

    // Create user
    const user = await userRepository.create({
      email,
      passwordHash,
      firstName,
      lastName,
      organizationId: organization.id,
      role,
      isActive: true,
      assignedClaimIds: [],
    });

    const payload: JwtPayload = {
      userId: user.id,
      email: user.email,
      organizationId: user.organizationId,
      role: user.role,
    };

    const tokens = this.generateToken(payload);

    logger.info('User registered', {
      userId: user.id,
      organizationId: user.organizationId,
      role: user.role,
    });

    return { user, tokens };
  }

  /**
   * Get tenant context from JWT payload
   */
  async getTenantContext(payload: JwtPayload): Promise<TenantContext> {
    // Fetch fresh user data to get current assigned claims
    const user = await userRepository.findById(payload.userId);

    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    if (!user.isActive) {
      throw new UnauthorizedError('Account is deactivated');
    }

    return {
      organizationId: payload.organizationId,
      userId: payload.userId,
      role: payload.role,
      assignedClaimIds: user.assignedClaimIds,
      providerId: payload.providerId,
      patientId: payload.patientId,
    };
  }
}

export const authService = new AuthService();
