export class DomainError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    statusCode: number = 400,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

// Authentication & Authorization Errors
export class UnauthorizedError extends DomainError {
  constructor(message: string = 'Authentication required') {
    super(message, 'UNAUTHORIZED', 401);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends DomainError {
  constructor(message: string = 'Access denied') {
    super(message, 'FORBIDDEN', 403);
    this.name = 'ForbiddenError';
  }
}

export class TenantAccessError extends DomainError {
  constructor(message: string = 'Cross-tenant access denied') {
    super(message, 'TENANT_ACCESS_DENIED', 403);
    this.name = 'TenantAccessError';
  }
}

// Resource Errors
export class NotFoundError extends DomainError {
  constructor(resource: string, identifier?: string) {
    const message = identifier 
      ? `${resource} with identifier '${identifier}' not found`
      : `${resource} not found`;
    super(message, 'NOT_FOUND', 404);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'CONFLICT', 409, details);
    this.name = 'ConflictError';
  }
}

// Validation Errors
export class ValidationError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', 400, details);
    this.name = 'ValidationError';
  }
}

export class InvalidClaimStatusTransitionError extends DomainError {
  constructor(fromStatus: string, toStatus: string) {
    super(
      `Invalid status transition from '${fromStatus}' to '${toStatus}'`,
      'INVALID_STATUS_TRANSITION',
      400,
      { fromStatus, toStatus }
    );
    this.name = 'InvalidClaimStatusTransitionError';
  }
}

export class ClaimNotModifiableError extends DomainError {
  constructor(claimId: string, status: string) {
    super(
      `Claim '${claimId}' cannot be modified in status '${status}'`,
      'CLAIM_NOT_MODIFIABLE',
      400,
      { claimId, status }
    );
    this.name = 'ClaimNotModifiableError';
  }
}

// Business Logic Errors
export class InvalidDiagnosisCodeError extends DomainError {
  constructor(code: string) {
    super(
      `Invalid diagnosis code: '${code}'`,
      'INVALID_DIAGNOSIS_CODE',
      400,
      { diagnosisCode: code }
    );
    this.name = 'InvalidDiagnosisCodeError';
  }
}

export class InvalidClaimAmountError extends DomainError {
  constructor(amount: number, min: number, max: number) {
    super(
      `Claim amount must be between ${min} and ${max}`,
      'INVALID_CLAIM_AMOUNT',
      400,
      { amount, min, max }
    );
    this.name = 'InvalidClaimAmountError';
  }
}

// Infrastructure Errors
export class DatabaseError extends DomainError {
  constructor(message: string = 'Database operation failed') {
    super(message, 'DATABASE_ERROR', 500);
    this.name = 'DatabaseError';
  }
}

export class QueueError extends DomainError {
  constructor(message: string = 'Queue operation failed') {
    super(message, 'QUEUE_ERROR', 500);
    this.name = 'QueueError';
  }
}

export class CacheError extends DomainError {
  constructor(message: string = 'Cache operation failed') {
    super(message, 'CACHE_ERROR', 500);
    this.name = 'CacheError';
  }
}

// Rate Limiting
export class RateLimitError extends DomainError {
  constructor(retryAfter?: number) {
    super(
      'Too many requests, please try again later',
      'RATE_LIMIT_EXCEEDED',
      429,
      retryAfter ? { retryAfter } : undefined
    );
    this.name = 'RateLimitError';
  }
}

// Idempotency
export class IdempotencyConflictError extends DomainError {
  constructor(idempotencyKey: string) {
    super(
      `Request with idempotency key '${idempotencyKey}' is already being processed`,
      'IDEMPOTENCY_CONFLICT',
      409,
      { idempotencyKey }
    );
    this.name = 'IdempotencyConflictError';
  }
}
