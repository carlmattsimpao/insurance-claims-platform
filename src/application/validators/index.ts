import { z } from 'zod';
import { VALID_DIAGNOSIS_CODES, CLAIM_AMOUNT_CONSTRAINTS } from '../../domain/entities/index.js';
import { ClaimStatus, PatientStatusType } from '../../shared/types/index.js';

// Common validators
const uuidSchema = z.string().uuid('Invalid UUID format');
const dateSchema = z.coerce.date();

// Pagination schema
export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  cursor: z.string().optional(),
});

// Sorting schema
export const sortOrderSchema = z.enum(['asc', 'desc']).default('desc');

// ============ CLAIM SCHEMAS ============

// Create claim request
export const createClaimSchema = z.object({
  patientId: uuidSchema,
  providerId: uuidSchema,
  diagnosisCode: z.string().refine(
    (code) => VALID_DIAGNOSIS_CODES.includes(code as typeof VALID_DIAGNOSIS_CODES[number]),
    { message: 'Invalid diagnosis code' }
  ),
  procedureCode: z.string().max(20).optional(),
  amount: z
    .number()
    .min(CLAIM_AMOUNT_CONSTRAINTS.MIN, `Amount must be at least ${CLAIM_AMOUNT_CONSTRAINTS.MIN}`)
    .max(CLAIM_AMOUNT_CONSTRAINTS.MAX, `Amount cannot exceed ${CLAIM_AMOUNT_CONSTRAINTS.MAX}`),
  serviceDate: dateSchema,
  notes: z.string().max(1000).optional(),
});

export type CreateClaimInput = z.infer<typeof createClaimSchema>;

// List claims query parameters
export const listClaimsQuerySchema = z.object({
  // Pagination
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  cursor: z.string().optional(),
  
  // Date range filter
  fromDate: z.coerce.date().optional(),
  toDate: z.coerce.date().optional(),
  
  // Status filter (single or multiple)
  status: z
    .union([
      z.enum([
        ClaimStatus.SUBMITTED,
        ClaimStatus.UNDER_REVIEW,
        ClaimStatus.APPROVED,
        ClaimStatus.REJECTED,
        ClaimStatus.PAID,
      ]),
      z.array(
        z.enum([
          ClaimStatus.SUBMITTED,
          ClaimStatus.UNDER_REVIEW,
          ClaimStatus.APPROVED,
          ClaimStatus.REJECTED,
          ClaimStatus.PAID,
        ])
      ),
    ])
    .optional(),
  
  // Entity filters
  patientId: uuidSchema.optional(),
  providerId: uuidSchema.optional(),
  
  // Amount range filter
  minAmount: z.coerce.number().min(0).optional(),
  maxAmount: z.coerce.number().max(CLAIM_AMOUNT_CONSTRAINTS.MAX).optional(),
  
  // Sorting
  sortBy: z.enum(['createdAt', 'amount', 'status', 'serviceDate']).default('createdAt'),
  sortOrder: sortOrderSchema,
});

export type ListClaimsQuery = z.infer<typeof listClaimsQuerySchema>;

// Update claim status
export const updateClaimStatusSchema = z.object({
  status: z.enum([
    ClaimStatus.SUBMITTED,
    ClaimStatus.UNDER_REVIEW,
    ClaimStatus.APPROVED,
    ClaimStatus.REJECTED,
    ClaimStatus.PAID,
  ]),
  reason: z.string().max(500).optional(),
});

export type UpdateClaimStatusInput = z.infer<typeof updateClaimStatusSchema>;

// Bulk status update
export const bulkStatusUpdateSchema = z.object({
  claimIds: z.array(uuidSchema).min(1).max(100),
  status: z.enum([
    ClaimStatus.SUBMITTED,
    ClaimStatus.UNDER_REVIEW,
    ClaimStatus.APPROVED,
    ClaimStatus.REJECTED,
    ClaimStatus.PAID,
  ]),
  reason: z.string().max(500).optional(),
});

export type BulkStatusUpdateInput = z.infer<typeof bulkStatusUpdateSchema>;

// Claim ID param
export const claimIdParamSchema = z.object({
  id: uuidSchema,
});

// ============ PATIENT STATUS SCHEMAS ============

// Create patient status event
export const createPatientStatusSchema = z.object({
  patientId: uuidSchema,
  statusType: z.enum([
    PatientStatusType.ADMISSION,
    PatientStatusType.DISCHARGE,
    PatientStatusType.TREATMENT,
  ]),
  occurredAt: dateSchema,
  details: z.object({
    facilityId: z.string().optional(),
    facilityName: z.string().max(255).optional(),
    admittingDiagnosis: z.string().max(255).optional(),
    dischargeDiagnosis: z.string().max(255).optional(),
    treatmentType: z.string().max(100).optional(),
    treatmentDescription: z.string().max(1000).optional(),
    attendingProviderId: uuidSchema.optional(),
    notes: z.string().max(2000).optional(),
  }).optional().default({}),
  // Idempotency key (client-provided or auto-generated)
  idempotencyKey: z.string().max(100).optional(),
});

export type CreatePatientStatusInput = z.infer<typeof createPatientStatusSchema>;

// Get patient status history
export const patientStatusHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type PatientStatusHistoryQuery = z.infer<typeof patientStatusHistoryQuerySchema>;

// Patient ID param
export const patientIdParamSchema = z.object({
  patientId: uuidSchema,
});

// ============ AUTH SCHEMAS ============

export const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      'Password must contain at least one uppercase letter, one lowercase letter, and one number'
    ),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  organizationCode: z.string().min(1).max(50),
  role: z.enum(['admin', 'claims_processor', 'provider', 'patient']).optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;

// ============ VALIDATION HELPERS ============

export function validateRequest<T extends z.ZodSchema>(
  schema: T,
  data: unknown
): z.infer<T> {
  return schema.parse(data);
}

export function safeValidateRequest<T extends z.ZodSchema>(
  schema: T,
  data: unknown
): { success: true; data: z.infer<T> } | { success: false; errors: z.ZodError } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error };
}
