import { eq, and } from 'drizzle-orm';
import { db } from '../connection.js';
import { users, type UserRow } from '../schema/index.js';
import type { IUserRepository } from '../../../domain/repositories/index.js';
import type { User } from '../../../domain/entities/index.js';
import type { UserRole } from '../../../shared/types/index.js';

export class UserRepository implements IUserRepository {
  private mapToDomain(row: UserRow): User {
    return {
      id: row.id,
      organizationId: row.organizationId,
      email: row.email,
      passwordHash: row.passwordHash,
      firstName: row.firstName,
      lastName: row.lastName,
      role: row.role as UserRole,
      isActive: row.isActive,
      providerId: row.providerId ?? undefined,
      patientId: row.patientId ?? undefined,
      assignedClaimIds: (row.assignedClaimIds as string[]) || [],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async findById(id: string): Promise<User | null> {
    const result = await db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    return result[0] ? this.mapToDomain(result[0]) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const result = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    return result[0] ? this.mapToDomain(result[0]) : null;
  }

  async findByIdWithinOrganization(
    id: string,
    organizationId: string
  ): Promise<User | null> {
    const result = await db
      .select()
      .from(users)
      .where(and(eq(users.id, id), eq(users.organizationId, organizationId)))
      .limit(1);

    return result[0] ? this.mapToDomain(result[0]) : null;
  }

  async create(
    data: Omit<User, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<User> {
    const result = await db
      .insert(users)
      .values({
        ...data,
        assignedClaimIds: data.assignedClaimIds || [],
      })
      .returning();

    return this.mapToDomain(result[0]);
  }

  async update(id: string, data: Partial<User>): Promise<User | null> {
    const { id: _, createdAt: __, ...updateData } = data;

    const result = await db
      .update(users)
      .set({
        ...updateData,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();

    return result[0] ? this.mapToDomain(result[0]) : null;
  }

  async updateAssignedClaims(userId: string, claimIds: string[]): Promise<void> {
    await db
      .update(users)
      .set({
        assignedClaimIds: claimIds,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  }
}

export const userRepository = new UserRepository();
