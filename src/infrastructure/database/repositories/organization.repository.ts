import { eq } from 'drizzle-orm';
import { db } from '../connection.js';
import { organizations, type OrganizationRow } from '../schema/index.js';
import type { IOrganizationRepository } from '../../../domain/repositories/index.js';
import type { Organization, OrganizationSettings } from '../../../domain/entities/index.js';

export class OrganizationRepository implements IOrganizationRepository {
  private mapToDomain(row: OrganizationRow): Organization {
    return {
      id: row.id,
      name: row.name,
      code: row.code,
      isActive: row.isActive,
      settings: row.settings as OrganizationSettings,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async findById(id: string): Promise<Organization | null> {
    const result = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, id))
      .limit(1);

    return result[0] ? this.mapToDomain(result[0]) : null;
  }

  async findByCode(code: string): Promise<Organization | null> {
    const result = await db
      .select()
      .from(organizations)
      .where(eq(organizations.code, code))
      .limit(1);

    return result[0] ? this.mapToDomain(result[0]) : null;
  }

  async create(
    data: Omit<Organization, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Organization> {
    const result = await db
      .insert(organizations)
      .values(data)
      .returning();

    return this.mapToDomain(result[0]);
  }

  async update(
    id: string,
    data: Partial<Organization>
  ): Promise<Organization | null> {
    const { id: _, createdAt: __, ...updateData } = data;

    const result = await db
      .update(organizations)
      .set({
        ...updateData,
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, id))
      .returning();

    return result[0] ? this.mapToDomain(result[0]) : null;
  }
}

export const organizationRepository = new OrganizationRepository();
