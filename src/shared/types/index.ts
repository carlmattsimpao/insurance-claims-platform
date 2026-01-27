// User roles in the system
export const UserRole = {
  ADMIN: 'admin',
  CLAIMS_PROCESSOR: 'claims_processor',
  PROVIDER: 'provider',
  PATIENT: 'patient',
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

// Claim status workflow
export const ClaimStatus = {
  SUBMITTED: 'submitted',
  UNDER_REVIEW: 'under_review',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  PAID: 'paid',
} as const;

export type ClaimStatus = (typeof ClaimStatus)[keyof typeof ClaimStatus];

// Patient status types
export const PatientStatusType = {
  ADMISSION: 'admission',
  DISCHARGE: 'discharge',
  TREATMENT: 'treatment',
} as const;

export type PatientStatusType = (typeof PatientStatusType)[keyof typeof PatientStatusType];

// Tenant context - passed through request lifecycle
export interface TenantContext {
  organizationId: string;
  userId: string;
  role: UserRole;
  // For claims processors - their assigned claim IDs
  assignedClaimIds?: string[];
  // For providers - their provider ID
  providerId?: string;
  // For patients - their patient ID  
  patientId?: string;
}

// Pagination types
export interface PaginationParams {
  limit: number;
  offset?: number;
  cursor?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
    nextCursor?: string;
  };
}

// Sorting
export type SortOrder = 'asc' | 'desc';

export interface SortParams {
  field: string;
  order: SortOrder;
}

// API Response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  meta?: {
    timestamp: string;
    requestId?: string;
  };
}

// Job types for BullMQ
export const JobType = {
  PATIENT_ADMISSION: 'patient_admission',
  PATIENT_DISCHARGE: 'patient_discharge',
  TREATMENT_INITIATED: 'treatment_initiated',
} as const;

export type JobType = (typeof JobType)[keyof typeof JobType];

export interface BaseJobData {
  jobId: string;
  organizationId: string;
  patientId: string;
  triggeredBy: string;
  triggeredAt: string;
  idempotencyKey: string;
}

export interface PatientAdmissionJobData extends BaseJobData {
  type: typeof JobType.PATIENT_ADMISSION;
}

export interface PatientDischargeJobData extends BaseJobData {
  type: typeof JobType.PATIENT_DISCHARGE;
}

export interface TreatmentInitiatedJobData extends BaseJobData {
  type: typeof JobType.TREATMENT_INITIATED;
  treatmentType: string;
}

export type ClaimJobData = 
  | PatientAdmissionJobData 
  | PatientDischargeJobData 
  | TreatmentInitiatedJobData;
