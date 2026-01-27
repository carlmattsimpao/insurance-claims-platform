import { eq, sql, desc } from 'drizzle-orm';
import { db } from '../connection.js';
import { patients, type PatientRow } from '../schema/index.js';
import { BaseTenantRepository } from './base.repository.js';
import type { IPatientRepository, QueryOptions } from '../../../domain/repositories/index.js';
import type { Patient, Address } from '../../../domain/entities/index.js';
import type { TenantContext } from '../../../shared/types/index.js';

export class PatientRepository
  extends BaseTenantRepository<typeof patients>
  implements IPatientRepository
{
  constructor() {
    super(patients, patients.organizationId);
  }

  private mapToDomain(row: PatientRow): Patient {
    return {
      id: row.id,
      organizationId: row.organizationId,
      firstName: row.firstName,
      lastName: row.lastName,
      dateOfBirth: row.dateOfBirth,
      memberId: row.memberId,
      isActive: row.isActive,
      contactEmail: row.contactEmail ?? undefined,
      contactPhone: row.contactPhone ?? undefined,
      address: row.address as Address | undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async findById(id: string, context: TenantContext): Promise<Patient | null> {
    const result = await db
      .select()
      .from(patients)
      .where(this.withTenantFilter(context, eq(patients.id, id)))
      .limit(1);

    return result[0] ? this.mapToDomain(result[0]) : null;
  }

  async findByMemberId(
    memberId: string,
    context: TenantContext
  ): Promise<Patient | null> {
    const result = await db
      .select()
      .from(patients)
      .where(this.withTenantFilter(context, eq(patients.memberId, memberId)))
      .limit(1);

    return result[0] ? this.mapToDomain(result[0]) : null;
  }

  async findMany(
    context: TenantContext,
    options?: QueryOptions
  ): Promise<Patient[]> {
    const limit = options?.pagination?.limit ?? 50;
    const offset = options?.pagination?.offset ?? 0;

    const result = await db
      .select()
      .from(patients)
      .where(this.getTenantFilter(context))
      .orderBy(desc(patients.createdAt))
      .limit(limit)
      .offset(offset);

    return result.map((row) => this.mapToDomain(row));
  }

  async create(
    data: Omit<Patient, 'id' | 'createdAt' | 'updatedAt'>,
    context: TenantContext
  ): Promise<Patient> {
    const result = await db
      .insert(patients)
      .values({
        ...data,
        organizationId: context.organizationId,
      })
      .returning();

    return this.mapToDomain(result[0]);
  }

  async update(
    id: string,
    data: Partial<Patient>,
    context: TenantContext
  ): Promise<Patient | null> {
    // Remove fields that shouldn't be updated
    const { id: _, organizationId: __, createdAt: ___, ...updateData } = data;

    const result = await db
      .update(patients)
      .set({
        ...updateData,
        updatedAt: new Date(),
      })
      .where(this.withTenantFilter(context, eq(patients.id, id)))
      .returning();

    return result[0] ? this.mapToDomain(result[0]) : null;
  }

  async exists(id: string, context: TenantContext): Promise<boolean> {
    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(patients)
      .where(this.withTenantFilter(context, eq(patients.id, id)));

    return (result[0]?.count ?? 0) > 0;
  }
}

export const patientRepository = new PatientRepository();
