import { eq, sql, desc } from 'drizzle-orm';
import { db } from '../connection.js';
import { providers, type ProviderRow } from '../schema/index.js';
import { BaseTenantRepository } from './base.repository.js';
import type { IProviderRepository, QueryOptions } from '../../../domain/repositories/index.js';
import type { Provider, Address } from '../../../domain/entities/index.js';
import type { TenantContext } from '../../../shared/types/index.js';

export class ProviderRepository
  extends BaseTenantRepository<typeof providers>
  implements IProviderRepository
{
  constructor() {
    super(providers, providers.organizationId);
  }

  private mapToDomain(row: ProviderRow): Provider {
    return {
      id: row.id,
      organizationId: row.organizationId,
      name: row.name,
      npi: row.npi,
      specialty: row.specialty,
      isActive: row.isActive,
      contactEmail: row.contactEmail,
      contactPhone: row.contactPhone ?? undefined,
      address: row.address as Address | undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async findById(id: string, context: TenantContext): Promise<Provider | null> {
    const result = await db
      .select()
      .from(providers)
      .where(this.withTenantFilter(context, eq(providers.id, id)))
      .limit(1);

    return result[0] ? this.mapToDomain(result[0]) : null;
  }

  async findByNpi(npi: string, context: TenantContext): Promise<Provider | null> {
    const result = await db
      .select()
      .from(providers)
      .where(this.withTenantFilter(context, eq(providers.npi, npi)))
      .limit(1);

    return result[0] ? this.mapToDomain(result[0]) : null;
  }

  async findMany(
    context: TenantContext,
    options?: QueryOptions
  ): Promise<Provider[]> {
    const limit = options?.pagination?.limit ?? 50;
    const offset = options?.pagination?.offset ?? 0;

    const result = await db
      .select()
      .from(providers)
      .where(this.getTenantFilter(context))
      .orderBy(desc(providers.createdAt))
      .limit(limit)
      .offset(offset);

    return result.map((row) => this.mapToDomain(row));
  }

  async create(
    data: Omit<Provider, 'id' | 'createdAt' | 'updatedAt'>,
    context: TenantContext
  ): Promise<Provider> {
    const result = await db
      .insert(providers)
      .values({
        ...data,
        organizationId: context.organizationId,
      })
      .returning();

    return this.mapToDomain(result[0]);
  }

  async update(
    id: string,
    data: Partial<Provider>,
    context: TenantContext
  ): Promise<Provider | null> {
    const { id: _, organizationId: __, createdAt: ___, ...updateData } = data;

    const result = await db
      .update(providers)
      .set({
        ...updateData,
        updatedAt: new Date(),
      })
      .where(this.withTenantFilter(context, eq(providers.id, id)))
      .returning();

    return result[0] ? this.mapToDomain(result[0]) : null;
  }

  async exists(id: string, context: TenantContext): Promise<boolean> {
    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(providers)
      .where(this.withTenantFilter(context, eq(providers.id, id)));

    return (result[0]?.count ?? 0) > 0;
  }
}

export const providerRepository = new ProviderRepository();
