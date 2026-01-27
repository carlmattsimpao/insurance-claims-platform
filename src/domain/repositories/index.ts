import type {
  Claim,
  Organization,
  Patient,
  PatientStatusEvent,
  Provider,
  User,
  JobProcessingLog,
  AuditLog,
} from '../entities/index.js';
import type {
  ClaimStatus,
  PaginatedResult,
  PaginationParams,
  SortParams,
  TenantContext,
} from '../../shared/types/index.js';

// Base repository interface with tenant awareness
export interface TenantAwareRepository<T> {
  findById(id: string, context: TenantContext): Promise<T | null>;
  findMany(context: TenantContext, options?: QueryOptions): Promise<T[]>;
  create(data: Omit<T, 'id' | 'createdAt' | 'updatedAt'>, context: TenantContext): Promise<T>;
  update(id: string, data: Partial<T>, context: TenantContext): Promise<T | null>;
  delete(id: string, context: TenantContext): Promise<boolean>;
}

export interface QueryOptions {
  pagination?: PaginationParams;
  sort?: SortParams;
  filters?: Record<string, unknown>;
}

// Claims Repository
export interface ClaimFilters {
  fromDate?: Date;
  toDate?: Date;
  status?: ClaimStatus | ClaimStatus[];
  patientId?: string;
  providerId?: string;
  minAmount?: number;
  maxAmount?: number;
  assignedTo?: string;
}

export interface ClaimSortField {
  field: 'createdAt' | 'amount' | 'status' | 'serviceDate';
  order: 'asc' | 'desc';
}

export interface IClaimRepository {
  // Standard CRUD with tenant filtering
  findById(id: string, context: TenantContext): Promise<Claim | null>;
  findByClaimNumber(claimNumber: string, context: TenantContext): Promise<Claim | null>;
  
  // List with filtering, sorting, pagination
  findMany(
    context: TenantContext,
    options: {
      filters?: ClaimFilters;
      sort?: ClaimSortField;
      pagination: PaginationParams;
    }
  ): Promise<PaginatedResult<Claim>>;
  
  // Find claims for a specific patient (used by jobs)
  findByPatientId(
    patientId: string,
    context: TenantContext,
    statusFilter?: ClaimStatus[]
  ): Promise<Claim[]>;
  
  // Create
  create(
    data: Omit<Claim, 'id' | 'createdAt' | 'updatedAt' | 'claimNumber' | 'statusHistory'>,
    context: TenantContext
  ): Promise<Claim>;
  
  // Update status (with audit trail)
  updateStatus(
    id: string,
    newStatus: ClaimStatus,
    context: TenantContext,
    reason?: string
  ): Promise<Claim | null>;
  
  // Bulk status update
  bulkUpdateStatus(
    ids: string[],
    newStatus: ClaimStatus,
    context: TenantContext,
    reason?: string
  ): Promise<{ updated: string[]; failed: string[] }>;
  
  // Assignment
  assignToProcessor(
    claimId: string,
    processorId: string,
    context: TenantContext
  ): Promise<Claim | null>;
  
  // Count for pagination
  count(context: TenantContext, filters?: ClaimFilters): Promise<number>;
}

// Patient Repository
export interface IPatientRepository {
  findById(id: string, context: TenantContext): Promise<Patient | null>;
  findByMemberId(memberId: string, context: TenantContext): Promise<Patient | null>;
  findMany(context: TenantContext, options?: QueryOptions): Promise<Patient[]>;
  create(
    data: Omit<Patient, 'id' | 'createdAt' | 'updatedAt'>,
    context: TenantContext
  ): Promise<Patient>;
  update(id: string, data: Partial<Patient>, context: TenantContext): Promise<Patient | null>;
  exists(id: string, context: TenantContext): Promise<boolean>;
}

// Provider Repository
export interface IProviderRepository {
  findById(id: string, context: TenantContext): Promise<Provider | null>;
  findByNpi(npi: string, context: TenantContext): Promise<Provider | null>;
  findMany(context: TenantContext, options?: QueryOptions): Promise<Provider[]>;
  create(
    data: Omit<Provider, 'id' | 'createdAt' | 'updatedAt'>,
    context: TenantContext
  ): Promise<Provider>;
  update(id: string, data: Partial<Provider>, context: TenantContext): Promise<Provider | null>;
  exists(id: string, context: TenantContext): Promise<boolean>;
}

// Patient Status Repository
export interface IPatientStatusRepository {
  findById(id: string, context: TenantContext): Promise<PatientStatusEvent | null>;
  findByIdempotencyKey(key: string, context: TenantContext): Promise<PatientStatusEvent | null>;
  
  // Get history for a patient
  getHistory(
    patientId: string,
    context: TenantContext,
    pagination?: PaginationParams
  ): Promise<PaginatedResult<PatientStatusEvent>>;
  
  create(
    data: Omit<PatientStatusEvent, 'id' | 'createdAt' | 'updatedAt'>,
    context: TenantContext
  ): Promise<PatientStatusEvent>;
  
  // Update job status
  updateJobStatus(
    id: string,
    jobId: string,
    status: 'pending' | 'processing' | 'completed' | 'failed',
    context: TenantContext
  ): Promise<PatientStatusEvent | null>;
}

// User Repository (for authentication)
export interface IUserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findByIdWithinOrganization(id: string, organizationId: string): Promise<User | null>;
  create(data: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): Promise<User>;
  update(id: string, data: Partial<User>): Promise<User | null>;
  updateAssignedClaims(userId: string, claimIds: string[]): Promise<void>;
}

// Organization Repository
export interface IOrganizationRepository {
  findById(id: string): Promise<Organization | null>;
  findByCode(code: string): Promise<Organization | null>;
  create(data: Omit<Organization, 'id' | 'createdAt' | 'updatedAt'>): Promise<Organization>;
  update(id: string, data: Partial<Organization>): Promise<Organization | null>;
}

// Job Processing Log Repository (for idempotency)
export interface IJobProcessingLogRepository {
  findByIdempotencyKey(
    idempotencyKey: string,
    organizationId: string
  ): Promise<JobProcessingLog | null>;
  
  create(
    data: Omit<JobProcessingLog, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<JobProcessingLog>;
  
  markCompleted(
    id: string,
    result: Record<string, unknown>
  ): Promise<JobProcessingLog | null>;
  
  markFailed(id: string, error: string): Promise<JobProcessingLog | null>;
}

// Audit Log Repository
export interface IAuditLogRepository {
  create(data: Omit<AuditLog, 'id' | 'createdAt' | 'updatedAt'>): Promise<AuditLog>;
  
  findByEntity(
    entityType: string,
    entityId: string,
    context: TenantContext
  ): Promise<AuditLog[]>;
}

// Transaction support
export interface ITransactionManager {
  runInTransaction<T>(fn: () => Promise<T>): Promise<T>;
}
