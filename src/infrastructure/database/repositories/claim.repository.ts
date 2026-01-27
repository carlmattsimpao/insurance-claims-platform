import { eq, and, gte, lte, inArray, sql, desc, asc, SQL } from 'drizzle-orm';
import { db, runInTransaction } from '../connection.js';
import { claims, type ClaimRow } from '../schema/index.js';
import { BaseTenantRepository, PermissionHelper } from './base.repository.js';
import type {
  IClaimRepository,
  ClaimFilters,
  ClaimSortField,
} from '../../../domain/repositories/index.js';
import type { Claim, ClaimStatusChange } from '../../../domain/entities/index.js';
import type {
  TenantContext,
  ClaimStatus,
  PaginatedResult,
  PaginationParams,
} from '../../../shared/types/index.js';
import {
  ForbiddenError,
  ClaimNotModifiableError,
} from '../../../domain/errors/index.js';

export class ClaimRepository
  extends BaseTenantRepository<typeof claims>
  implements IClaimRepository
{
  constructor() {
    super(claims, claims.organizationId);
  }

  /**
   * Generates a unique claim number
   */
  private generateClaimNumber(orgId: string): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    const orgPrefix = orgId.substring(0, 4).toUpperCase();
    return `CLM-${orgPrefix}-${timestamp}-${random}`;
  }

  /**
   * Maps database row to domain entity
   */
  private mapToDomain(row: ClaimRow): Claim {
    return {
      id: row.id,
      organizationId: row.organizationId,
      claimNumber: row.claimNumber,
      patientId: row.patientId,
      providerId: row.providerId,
      diagnosisCode: row.diagnosisCode,
      procedureCode: row.procedureCode ?? undefined,
      amount: parseFloat(row.amount),
      status: row.status as ClaimStatus,
      serviceDate: row.serviceDate,
      submittedAt: row.submittedAt,
      processedAt: row.processedAt ?? undefined,
      paidAt: row.paidAt ?? undefined,
      notes: row.notes ?? undefined,
      assignedTo: row.assignedTo ?? undefined,
      denialReason: row.denialReason ?? undefined,
      statusHistory: (row.statusHistory as ClaimStatusChange[]) || [],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  /**
   * Build role-based access filter
   * This is CRITICAL for security
   */
  private buildRoleFilter(context: TenantContext): SQL | undefined {
    const { role, providerId, patientId, assignedClaimIds } = context;

    switch (role) {
      case 'admin':
        // Admin can see all claims in their org
        return undefined;

      case 'claims_processor':
        // Claims processor can only see assigned claims
        if (!assignedClaimIds || assignedClaimIds.length === 0) {
          // Return a condition that matches nothing
          return sql`${claims.id} = 'no-access'`;
        }
        return inArray(claims.id, assignedClaimIds);

      case 'provider':
        // Provider can only see their own claims
        if (!providerId) {
          return sql`${claims.id} = 'no-access'`;
        }
        return eq(claims.providerId, providerId);

      case 'patient':
        // Patient can only see their own claims
        if (!patientId) {
          return sql`${claims.id} = 'no-access'`;
        }
        return eq(claims.patientId, patientId);

      default:
        // Unknown role - deny all access
        return sql`${claims.id} = 'no-access'`;
    }
  }

  /**
   * Build filter conditions from ClaimFilters
   */
  private buildFilterConditions(filters: ClaimFilters): SQL[] {
    const conditions: SQL[] = [];

    if (filters.fromDate) {
      conditions.push(gte(claims.serviceDate, filters.fromDate));
    }

    if (filters.toDate) {
      conditions.push(lte(claims.serviceDate, filters.toDate));
    }

    if (filters.status) {
      if (Array.isArray(filters.status)) {
        conditions.push(inArray(claims.status, filters.status));
      } else {
        conditions.push(eq(claims.status, filters.status));
      }
    }

    if (filters.patientId) {
      conditions.push(eq(claims.patientId, filters.patientId));
    }

    if (filters.providerId) {
      conditions.push(eq(claims.providerId, filters.providerId));
    }

    if (filters.minAmount !== undefined) {
      conditions.push(gte(claims.amount, filters.minAmount.toString()));
    }

    if (filters.maxAmount !== undefined) {
      conditions.push(lte(claims.amount, filters.maxAmount.toString()));
    }

    if (filters.assignedTo) {
      conditions.push(eq(claims.assignedTo, filters.assignedTo));
    }

    return conditions;
  }

  /**
   * Build sort order
   */
  private buildSortOrder(sort?: ClaimSortField) {
    if (!sort) {
      return desc(claims.createdAt);
    }

    const column = {
      createdAt: claims.createdAt,
      amount: claims.amount,
      status: claims.status,
      serviceDate: claims.serviceDate,
    }[sort.field];

    return sort.order === 'asc' ? asc(column) : desc(column);
  }

  async findById(id: string, context: TenantContext): Promise<Claim | null> {
    const roleFilter = this.buildRoleFilter(context);

    const result = await db
      .select()
      .from(claims)
      .where(this.withTenantFilter(context, eq(claims.id, id), roleFilter))
      .limit(1);

    return result[0] ? this.mapToDomain(result[0]) : null;
  }

  async findByClaimNumber(
    claimNumber: string,
    context: TenantContext
  ): Promise<Claim | null> {
    const roleFilter = this.buildRoleFilter(context);

    const result = await db
      .select()
      .from(claims)
      .where(
        this.withTenantFilter(
          context,
          eq(claims.claimNumber, claimNumber),
          roleFilter
        )
      )
      .limit(1);

    return result[0] ? this.mapToDomain(result[0]) : null;
  }

  async findMany(
    context: TenantContext,
    options: {
      filters?: ClaimFilters;
      sort?: ClaimSortField;
      pagination: PaginationParams;
    }
  ): Promise<PaginatedResult<Claim>> {
    const { filters, sort, pagination } = options;
    const { limit, offset = 0 } = pagination;

    // Build all conditions
    const roleFilter = this.buildRoleFilter(context);
    const filterConditions = filters ? this.buildFilterConditions(filters) : [];

    const whereCondition = this.withTenantFilter(
      context,
      roleFilter,
      ...filterConditions
    );

    // Execute query with pagination
    const [rows, countResult] = await Promise.all([
      db
        .select()
        .from(claims)
        .where(whereCondition)
        .orderBy(this.buildSortOrder(sort))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(claims)
        .where(whereCondition),
    ]);

    const total = countResult[0]?.count ?? 0;

    return {
      data: rows.map((row) => this.mapToDomain(row)),
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + rows.length < total,
        nextCursor:
          rows.length === limit ? rows[rows.length - 1].id : undefined,
      },
    };
  }

  async findByPatientId(
    patientId: string,
    context: TenantContext,
    statusFilter?: ClaimStatus[]
  ): Promise<Claim[]> {
    const conditions: SQL[] = [eq(claims.patientId, patientId)];

    if (statusFilter && statusFilter.length > 0) {
      conditions.push(inArray(claims.status, statusFilter));
    }

    const result = await db
      .select()
      .from(claims)
      .where(this.withTenantFilter(context, ...conditions))
      .orderBy(desc(claims.createdAt));

    return result.map((row) => this.mapToDomain(row));
  }

  async create(
    data: Omit<
      Claim,
      'id' | 'createdAt' | 'updatedAt' | 'claimNumber' | 'statusHistory'
    >,
    context: TenantContext
  ): Promise<Claim> {
    // Validate permission
    PermissionHelper.requirePermission(
      PermissionHelper.canCreateClaims(context.role),
      'create claims',
      context.role
    );

    // For providers, ensure they're creating claims for themselves
    if (context.role === 'provider' && data.providerId !== context.providerId) {
      throw new ForbiddenError('Providers can only create claims for themselves');
    }

    const claimNumber = this.generateClaimNumber(context.organizationId);
    const now = new Date();

    const initialStatusChange: ClaimStatusChange = {
      fromStatus: null,
      toStatus: 'submitted',
      changedBy: context.userId,
      changedAt: now,
      reason: 'Initial submission',
    };

    const result = await db
      .insert(claims)
      .values({
        ...data,
        amount: data.amount.toString(),
        organizationId: context.organizationId,
        claimNumber,
        status: 'submitted',
        submittedAt: now,
        statusHistory: [initialStatusChange],
      })
      .returning();

    return this.mapToDomain(result[0]);
  }

  async updateStatus(
    id: string,
    newStatus: ClaimStatus,
    context: TenantContext,
    reason?: string
  ): Promise<Claim | null> {
    // Validate permission
    PermissionHelper.requirePermission(
      PermissionHelper.canUpdateClaimStatus(context.role),
      'update claim status',
      context.role
    );

    return await runInTransaction(async (tx) => {
      // Find claim with tenant and role filtering
      const roleFilter = this.buildRoleFilter(context);
      const existing = await tx
        .select()
        .from(claims)
        .where(this.withTenantFilter(context, eq(claims.id, id), roleFilter))
        .limit(1);

      if (!existing[0]) {
        return null;
      }

      const claim = existing[0];

      // Check if claim can be modified
      if (claim.status === 'approved' || claim.status === 'paid') {
        throw new ClaimNotModifiableError(id, claim.status);
      }

      // For claims processors, verify assignment
      if (
        context.role === 'claims_processor' &&
        claim.assignedTo !== context.userId
      ) {
        throw new ForbiddenError(
          'Claims processors can only update their assigned claims'
        );
      }

      // Build status change record
      const statusChange: ClaimStatusChange = {
        fromStatus: claim.status as ClaimStatus,
        toStatus: newStatus,
        changedBy: context.userId,
        changedAt: new Date(),
        reason,
      };

      const currentHistory = (claim.statusHistory as ClaimStatusChange[]) || [];

      // Determine processed/paid timestamps
      const processedAt =
        ['approved', 'rejected'].includes(newStatus) && !claim.processedAt
          ? new Date()
          : claim.processedAt;

      const paidAt =
        newStatus === 'paid' && !claim.paidAt ? new Date() : claim.paidAt;

      const result = await tx
        .update(claims)
        .set({
          status: newStatus,
          statusHistory: [...currentHistory, statusChange],
          processedAt,
          paidAt,
          updatedAt: new Date(),
        })
        .where(eq(claims.id, id))
        .returning();

      return result[0] ? this.mapToDomain(result[0]) : null;
    });
  }

  async bulkUpdateStatus(
    ids: string[],
    newStatus: ClaimStatus,
    context: TenantContext,
    reason?: string
  ): Promise<{ updated: string[]; failed: string[] }> {
    PermissionHelper.requirePermission(
      PermissionHelper.canUpdateClaimStatus(context.role),
      'bulk update claim status',
      context.role
    );

    const updated: string[] = [];
    const failed: string[] = [];

    // Process each claim individually to ensure proper validation
    for (const id of ids) {
      try {
        const result = await this.updateStatus(id, newStatus, context, reason);
        if (result) {
          updated.push(id);
        } else {
          failed.push(id);
        }
      } catch (error) {
        failed.push(id);
      }
    }

    return { updated, failed };
  }

  async assignToProcessor(
    claimId: string,
    processorId: string,
    context: TenantContext
  ): Promise<Claim | null> {
    // Only admins can assign claims
    if (context.role !== 'admin') {
      throw new ForbiddenError('Only admins can assign claims to processors');
    }

    const result = await db
      .update(claims)
      .set({
        assignedTo: processorId,
        updatedAt: new Date(),
      })
      .where(this.withTenantFilter(context, eq(claims.id, claimId)))
      .returning();

    return result[0] ? this.mapToDomain(result[0]) : null;
  }

  async count(context: TenantContext, filters?: ClaimFilters): Promise<number> {
    const roleFilter = this.buildRoleFilter(context);
    const filterConditions = filters ? this.buildFilterConditions(filters) : [];

    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(claims)
      .where(this.withTenantFilter(context, roleFilter, ...filterConditions));

    return result[0]?.count ?? 0;
  }

  async sumAmount(context: TenantContext, filters?: ClaimFilters): Promise<number> {
    const roleFilter = this.buildRoleFilter(context);
    const filterConditions = filters ? this.buildFilterConditions(filters) : [];

    const result = await db
      .select({ total: sql<string>`COALESCE(SUM(${claims.amount}), 0)` })
      .from(claims)
      .where(this.withTenantFilter(context, roleFilter, ...filterConditions));

    return parseFloat(result[0]?.total ?? '0');
  }

  /**
   * Internal method for background jobs - bypasses role filter
   * ONLY use this in trusted job contexts with proper org filtering
   */
  async findByPatientIdInternal(
    patientId: string,
    organizationId: string,
    statusFilter?: ClaimStatus[]
  ): Promise<Claim[]> {
    const conditions: SQL[] = [
      eq(claims.organizationId, organizationId),
      eq(claims.patientId, patientId),
    ];

    if (statusFilter && statusFilter.length > 0) {
      conditions.push(inArray(claims.status, statusFilter));
    }

    const result = await db
      .select()
      .from(claims)
      .where(and(...conditions))
      .orderBy(desc(claims.createdAt));

    return result.map((row) => this.mapToDomain(row));
  }

  /**
   * Internal method for background jobs - updates status without role check
   * ONLY use this in trusted job contexts
   */
  async updateStatusInternal(
    id: string,
    organizationId: string,
    newStatus: ClaimStatus,
    changedBy: string,
    reason?: string
  ): Promise<Claim | null> {
    return await runInTransaction(async (tx) => {
      const existing = await tx
        .select()
        .from(claims)
        .where(and(eq(claims.id, id), eq(claims.organizationId, organizationId)))
        .limit(1);

      if (!existing[0]) {
        return null;
      }

      const claim = existing[0];

      // Still check if claim can be modified
      if (claim.status === 'approved' || claim.status === 'paid') {
        return null; // Silently skip in job context
      }

      const statusChange: ClaimStatusChange = {
        fromStatus: claim.status as ClaimStatus,
        toStatus: newStatus,
        changedBy,
        changedAt: new Date(),
        reason,
      };

      const currentHistory = (claim.statusHistory as ClaimStatusChange[]) || [];

      const result = await tx
        .update(claims)
        .set({
          status: newStatus,
          statusHistory: [...currentHistory, statusChange],
          updatedAt: new Date(),
        })
        .where(eq(claims.id, id))
        .returning();

      return result[0] ? this.mapToDomain(result[0]) : null;
    });
  }
}

export const claimRepository = new ClaimRepository();
