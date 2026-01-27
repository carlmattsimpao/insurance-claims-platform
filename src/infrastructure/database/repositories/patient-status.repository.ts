import { eq, and, sql, desc } from 'drizzle-orm';
import { db } from '../connection.js';
import { patientStatusEvents, type PatientStatusEventRow } from '../schema/index.js';
import { BaseTenantRepository } from './base.repository.js';
import type { IPatientStatusRepository } from '../../../domain/repositories/index.js';
import type { PatientStatusEvent, PatientStatusDetails } from '../../../domain/entities/index.js';
import type {
  TenantContext,
  PaginatedResult,
  PaginationParams,
  PatientStatusType,
} from '../../../shared/types/index.js';

export class PatientStatusRepository
  extends BaseTenantRepository<typeof patientStatusEvents>
  implements IPatientStatusRepository
{
  constructor() {
    super(patientStatusEvents, patientStatusEvents.organizationId);
  }

  private mapToDomain(row: PatientStatusEventRow): PatientStatusEvent {
    return {
      id: row.id,
      organizationId: row.organizationId,
      patientId: row.patientId,
      statusType: row.statusType as PatientStatusType,
      occurredAt: row.occurredAt,
      details: row.details as PatientStatusDetails,
      jobId: row.jobId ?? undefined,
      jobStatus: row.jobStatus as 'pending' | 'processing' | 'completed' | 'failed' | undefined,
      jobCompletedAt: row.jobCompletedAt ?? undefined,
      idempotencyKey: row.idempotencyKey,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async findById(
    id: string,
    context: TenantContext
  ): Promise<PatientStatusEvent | null> {
    const result = await db
      .select()
      .from(patientStatusEvents)
      .where(this.withTenantFilter(context, eq(patientStatusEvents.id, id)))
      .limit(1);

    return result[0] ? this.mapToDomain(result[0]) : null;
  }

  async findByIdempotencyKey(
    key: string,
    context: TenantContext
  ): Promise<PatientStatusEvent | null> {
    const result = await db
      .select()
      .from(patientStatusEvents)
      .where(
        this.withTenantFilter(context, eq(patientStatusEvents.idempotencyKey, key))
      )
      .limit(1);

    return result[0] ? this.mapToDomain(result[0]) : null;
  }

  async getHistory(
    patientId: string,
    context: TenantContext,
    pagination?: PaginationParams
  ): Promise<PaginatedResult<PatientStatusEvent>> {
    const limit = pagination?.limit ?? 50;
    const offset = pagination?.offset ?? 0;

    const whereCondition = this.withTenantFilter(
      context,
      eq(patientStatusEvents.patientId, patientId)
    );

    const [rows, countResult] = await Promise.all([
      db
        .select()
        .from(patientStatusEvents)
        .where(whereCondition)
        .orderBy(desc(patientStatusEvents.occurredAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(patientStatusEvents)
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
      },
    };
  }

  async create(
    data: Omit<PatientStatusEvent, 'id' | 'createdAt' | 'updatedAt'>,
    context: TenantContext
  ): Promise<PatientStatusEvent> {
    const result = await db
      .insert(patientStatusEvents)
      .values({
        ...data,
        organizationId: context.organizationId,
        jobStatus: 'pending',
      })
      .returning();

    return this.mapToDomain(result[0]);
  }

  async updateJobStatus(
    id: string,
    jobId: string,
    status: 'pending' | 'processing' | 'completed' | 'failed',
    context: TenantContext
  ): Promise<PatientStatusEvent | null> {
    const jobCompletedAt =
      status === 'completed' || status === 'failed' ? new Date() : undefined;

    const result = await db
      .update(patientStatusEvents)
      .set({
        jobId,
        jobStatus: status,
        jobCompletedAt,
        updatedAt: new Date(),
      })
      .where(this.withTenantFilter(context, eq(patientStatusEvents.id, id)))
      .returning();

    return result[0] ? this.mapToDomain(result[0]) : null;
  }

  /**
   * Internal method for job processing - bypasses role filter
   */
  async updateJobStatusInternal(
    id: string,
    organizationId: string,
    jobId: string,
    status: 'pending' | 'processing' | 'completed' | 'failed'
  ): Promise<PatientStatusEvent | null> {
    const jobCompletedAt =
      status === 'completed' || status === 'failed' ? new Date() : undefined;

    const result = await db
      .update(patientStatusEvents)
      .set({
        jobId,
        jobStatus: status,
        jobCompletedAt,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(patientStatusEvents.id, id),
          eq(patientStatusEvents.organizationId, organizationId)
        )
      )
      .returning();

    return result[0] ? this.mapToDomain(result[0]) : null;
  }
}

export const patientStatusRepository = new PatientStatusRepository();
