import { eq, and, SQL } from 'drizzle-orm';
import { PgTable, PgColumn } from 'drizzle-orm/pg-core';
import type { TenantContext, UserRole } from '../../../shared/types/index.js';
import { ForbiddenError, TenantAccessError } from '../../../domain/errors/index.js';

/**
 * Base repository that enforces tenant isolation.
 * 
 * CRITICAL: All queries MUST go through this base to ensure
 * tenant filtering is applied automatically.
 */
export abstract class BaseTenantRepository<TTable extends PgTable> {
  protected table: TTable;
  protected organizationIdColumn: PgColumn;

  constructor(table: TTable, organizationIdColumn: PgColumn) {
    this.table = table;
    this.organizationIdColumn = organizationIdColumn;
  }

  /**
   * Creates the base tenant filter condition.
   * This MUST be included in all queries.
   */
  protected getTenantFilter(context: TenantContext): SQL {
    return eq(this.organizationIdColumn, context.organizationId);
  }

  /**
   * Combines tenant filter with additional conditions.
   */
  protected withTenantFilter(context: TenantContext, ...conditions: (SQL | undefined)[]): SQL {
    const validConditions = conditions.filter((c): c is SQL => c !== undefined);
    return and(this.getTenantFilter(context), ...validConditions) as SQL;
  }

  /**
   * Validates that a given organization ID matches the context.
   * Use this to prevent cross-tenant data injection.
   */
  protected validateTenantMatch(
    dataOrgId: string,
    context: TenantContext,
    entityName: string = 'Entity'
  ): void {
    if (dataOrgId !== context.organizationId) {
      throw new TenantAccessError(
        `${entityName} does not belong to your organization`
      );
    }
  }

  /**
   * Adds organization ID to data being inserted.
   */
  protected addTenantId<T extends Record<string, unknown>>(
    data: T,
    context: TenantContext
  ): T & { organizationId: string } {
    return {
      ...data,
      organizationId: context.organizationId,
    };
  }
}

/**
 * Permission helpers for role-based access control.
 */
export class PermissionHelper {
  /**
   * Check if user is an admin
   */
  static isAdmin(role: UserRole): boolean {
    return role === 'admin';
  }

  /**
   * Check if user can access all claims in their org (admin)
   */
  static canAccessAllClaims(role: UserRole): boolean {
    return role === 'admin';
  }

  /**
   * Check if user can only access assigned claims (claims_processor)
   */
  static canOnlyAccessAssignedClaims(role: UserRole): boolean {
    return role === 'claims_processor';
  }

  /**
   * Check if user can only access their own claims (provider)
   */
  static canOnlyAccessOwnProviderClaims(role: UserRole): boolean {
    return role === 'provider';
  }

  /**
   * Check if user can only view their own claims (patient)
   */
  static canOnlyViewOwnPatientClaims(role: UserRole): boolean {
    return role === 'patient';
  }

  /**
   * Check if user can create claims
   */
  static canCreateClaims(role: UserRole): boolean {
    return ['admin', 'claims_processor', 'provider'].includes(role);
  }

  /**
   * Check if user can update claim status
   */
  static canUpdateClaimStatus(role: UserRole): boolean {
    return ['admin', 'claims_processor'].includes(role);
  }

  /**
   * Check if user has read-only access
   */
  static isReadOnly(role: UserRole): boolean {
    return role === 'patient';
  }

  /**
   * Validate permission and throw if not allowed
   */
  static requirePermission(
    allowed: boolean,
    action: string,
    role: UserRole
  ): void {
    if (!allowed) {
      throw new ForbiddenError(
        `Role '${role}' is not allowed to ${action}`
      );
    }
  }
}

/**
 * SQL helpers for building tenant-aware queries.
 */
export const tenantSql = {
  /**
   * Create a parameterized tenant filter
   */
  orgFilter: (orgId: string, column: PgColumn) => eq(column, orgId),

  /**
   * Combine multiple conditions with AND
   */
  andConditions: (...conditions: (SQL | undefined)[]) => {
    const valid = conditions.filter((c): c is SQL => c !== undefined);
    return valid.length > 0 ? and(...valid) : undefined;
  },
};
