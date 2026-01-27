import type { ClaimStatus, PatientStatusType, UserRole } from '../../shared/types/index.js';

// Base entity with common fields
export interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

// Tenant-aware entity base
export interface TenantEntity extends BaseEntity {
  organizationId: string;
}

// Organization (Tenant)
export interface Organization extends BaseEntity {
  name: string;
  code: string; // Unique identifier code
  isActive: boolean;
  settings: OrganizationSettings;
}

export interface OrganizationSettings {
  maxClaimAmount: number;
  minClaimAmount: number;
  autoApproveThreshold?: number;
  requiresManualReview: boolean;
}

// User entity
export interface User extends TenantEntity {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  isActive: boolean;
  // Role-specific associations
  providerId?: string;
  patientId?: string;
  // For claims processors - assigned claims
  assignedClaimIds: string[];
}

// Provider (Healthcare provider)
export interface Provider extends TenantEntity {
  name: string;
  npi: string; // National Provider Identifier
  specialty: string;
  isActive: boolean;
  contactEmail: string;
  contactPhone?: string;
  address?: Address;
}

// Patient
export interface Patient extends TenantEntity {
  firstName: string;
  lastName: string;
  dateOfBirth: Date;
  memberId: string; // Insurance member ID
  isActive: boolean;
  contactEmail?: string;
  contactPhone?: string;
  address?: Address;
}

// Address (value object)
export interface Address {
  street: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
}

// Claim
export interface Claim extends TenantEntity {
  claimNumber: string; // Human-readable claim number
  patientId: string;
  providerId: string;
  diagnosisCode: string;
  procedureCode?: string;
  amount: number;
  status: ClaimStatus;
  serviceDate: Date;
  submittedAt: Date;
  processedAt?: Date;
  paidAt?: Date;
  notes?: string;
  // Assignment for claims processors
  assignedTo?: string;
  // Denial reason if rejected
  denialReason?: string;
  // Audit trail
  statusHistory: ClaimStatusChange[];
}

export interface ClaimStatusChange {
  fromStatus: ClaimStatus | null;
  toStatus: ClaimStatus;
  changedBy: string;
  changedAt: Date;
  reason?: string;
}

// Patient Status Event
export interface PatientStatusEvent extends TenantEntity {
  patientId: string;
  statusType: PatientStatusType;
  occurredAt: Date;
  details: PatientStatusDetails;
  // Job tracking
  jobId?: string;
  jobStatus?: 'pending' | 'processing' | 'completed' | 'failed';
  jobCompletedAt?: Date;
  // Idempotency
  idempotencyKey: string;
}

export interface PatientStatusDetails {
  facilityId?: string;
  facilityName?: string;
  admittingDiagnosis?: string;
  dischargeDiagnosis?: string;
  treatmentType?: string;
  treatmentDescription?: string;
  attendingProviderId?: string;
  notes?: string;
}

// Job Processing Log - for idempotency and audit
export interface JobProcessingLog extends TenantEntity {
  jobId: string;
  jobType: string;
  idempotencyKey: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  payload: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
  startedAt: Date;
  completedAt?: Date;
  retryCount: number;
}

// Audit Log
export interface AuditLog extends TenantEntity {
  entityType: string;
  entityId: string;
  action: string;
  performedBy: string;
  performedAt: Date;
  changes: Record<string, { old: unknown; new: unknown }>;
  ipAddress?: string;
  userAgent?: string;
}

// Valid ICD-10 diagnosis codes (simplified for exercise)
export const VALID_DIAGNOSIS_CODES = [
  'J06.9',  // Acute upper respiratory infection
  'J18.9',  // Pneumonia
  'K21.0',  // GERD with esophagitis
  'M54.5',  // Low back pain
  'I10',    // Essential hypertension
  'E11.9',  // Type 2 diabetes
  'F32.9',  // Major depressive disorder
  'J45.909', // Asthma
  'N39.0',  // Urinary tract infection
  'R51',    // Headache
  'S62.309A', // Fracture of metacarpal bone
  'Z00.00', // General adult medical examination
] as const;

export type DiagnosisCode = (typeof VALID_DIAGNOSIS_CODES)[number];

// Claim amount constraints
export const CLAIM_AMOUNT_CONSTRAINTS = {
  MIN: 0.01,
  MAX: 1_000_000,
} as const;
