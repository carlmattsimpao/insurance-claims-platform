import { eq, and } from 'drizzle-orm';
import { db } from '../connection.js';
import { jobProcessingLogs, type JobProcessingLogRow } from '../schema/index.js';
import type { IJobProcessingLogRepository } from '../../../domain/repositories/index.js';
import type { JobProcessingLog } from '../../../domain/entities/index.js';

export class JobProcessingLogRepository implements IJobProcessingLogRepository {
  private mapToDomain(row: JobProcessingLogRow): JobProcessingLog {
    return {
      id: row.id,
      organizationId: row.organizationId,
      jobId: row.jobId,
      jobType: row.jobType,
      idempotencyKey: row.idempotencyKey,
      status: row.status as 'pending' | 'processing' | 'completed' | 'failed',
      payload: row.payload as Record<string, unknown>,
      result: row.result as Record<string, unknown> | undefined,
      error: row.error ?? undefined,
      startedAt: row.startedAt,
      completedAt: row.completedAt ?? undefined,
      retryCount: parseInt(row.retryCount, 10),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async findByIdempotencyKey(
    idempotencyKey: string,
    organizationId: string
  ): Promise<JobProcessingLog | null> {
    const result = await db
      .select()
      .from(jobProcessingLogs)
      .where(
        and(
          eq(jobProcessingLogs.idempotencyKey, idempotencyKey),
          eq(jobProcessingLogs.organizationId, organizationId)
        )
      )
      .limit(1);

    return result[0] ? this.mapToDomain(result[0]) : null;
  }

  async create(
    data: Omit<JobProcessingLog, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<JobProcessingLog> {
    const result = await db
      .insert(jobProcessingLogs)
      .values({
        ...data,
        retryCount: data.retryCount.toString(),
      })
      .returning();

    return this.mapToDomain(result[0]);
  }

  async markCompleted(
    id: string,
    result: Record<string, unknown>
  ): Promise<JobProcessingLog | null> {
    const updateResult = await db
      .update(jobProcessingLogs)
      .set({
        status: 'completed',
        result,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(jobProcessingLogs.id, id))
      .returning();

    return updateResult[0] ? this.mapToDomain(updateResult[0]) : null;
  }

  async markFailed(id: string, error: string): Promise<JobProcessingLog | null> {
    const result = await db
      .update(jobProcessingLogs)
      .set({
        status: 'failed',
        error,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(jobProcessingLogs.id, id))
      .returning();

    return result[0] ? this.mapToDomain(result[0]) : null;
  }

  async incrementRetryCount(id: string): Promise<void> {
    await db
      .update(jobProcessingLogs)
      .set({
        retryCount: String(
          parseInt(
            (
              await db
                .select({ retryCount: jobProcessingLogs.retryCount })
                .from(jobProcessingLogs)
                .where(eq(jobProcessingLogs.id, id))
                .limit(1)
            )[0]?.retryCount || '0',
            10
          ) + 1
        ),
        updatedAt: new Date(),
      })
      .where(eq(jobProcessingLogs.id, id));
  }
}

export const jobProcessingLogRepository = new JobProcessingLogRepository();
