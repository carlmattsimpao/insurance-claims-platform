import {
  pgTable,
  varchar,
  text,
  timestamp,
  boolean,
  decimal,
  jsonb,
  uuid,
  index,
  uniqueIndex,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums
export const userRoleEnum = pgEnum('user_role', [
  'admin',
  'claims_processor',
  'provider',
  'patient',
]);

export const claimStatusEnum = pgEnum('claim_status', [
  'submitted',
  'under_review',
  'approved',
  'rejected',
  'paid',
]);

export const patientStatusTypeEnum = pgEnum('patient_status_type', [
  'admission',
  'discharge',
  'treatment',
]);

export const jobStatusEnum = pgEnum('job_status', [
  'pending',
  'processing',
  'completed',
  'failed',
]);

// Organizations (Tenants)
export const organizations = pgTable(
  'organizations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 255 }).notNull(),
    code: varchar('code', { length: 50 }).notNull().unique(),
    isActive: boolean('is_active').notNull().default(true),
    settings: jsonb('settings').notNull().default({
      maxClaimAmount: 1000000,
      minClaimAmount: 0.01,
      requiresManualReview: true,
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    codeIdx: uniqueIndex('organizations_code_idx').on(table.code),
  })
);

// Users
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    email: varchar('email', { length: 255 }).notNull(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    firstName: varchar('first_name', { length: 100 }).notNull(),
    lastName: varchar('last_name', { length: 100 }).notNull(),
    role: userRoleEnum('role').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    providerId: uuid('provider_id'),
    patientId: uuid('patient_id'),
    assignedClaimIds: jsonb('assigned_claim_ids').notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // Composite unique: email unique within organization
    emailOrgIdx: uniqueIndex('users_email_org_idx').on(table.email, table.organizationId),
    // Index for tenant filtering (most important!)
    orgIdx: index('users_org_idx').on(table.organizationId),
    roleIdx: index('users_role_idx').on(table.role),
  })
);

// Providers
export const providers = pgTable(
  'providers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    npi: varchar('npi', { length: 20 }).notNull(),
    specialty: varchar('specialty', { length: 100 }).notNull(),
    isActive: boolean('is_active').notNull().default(true),
    contactEmail: varchar('contact_email', { length: 255 }).notNull(),
    contactPhone: varchar('contact_phone', { length: 20 }),
    address: jsonb('address'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // Tenant filtering index
    orgIdx: index('providers_org_idx').on(table.organizationId),
    // NPI unique within organization
    npiOrgIdx: uniqueIndex('providers_npi_org_idx').on(table.npi, table.organizationId),
  })
);

// Patients
export const patients = pgTable(
  'patients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    firstName: varchar('first_name', { length: 100 }).notNull(),
    lastName: varchar('last_name', { length: 100 }).notNull(),
    dateOfBirth: timestamp('date_of_birth', { withTimezone: true }).notNull(),
    memberId: varchar('member_id', { length: 50 }).notNull(),
    isActive: boolean('is_active').notNull().default(true),
    contactEmail: varchar('contact_email', { length: 255 }),
    contactPhone: varchar('contact_phone', { length: 20 }),
    address: jsonb('address'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // Tenant filtering index
    orgIdx: index('patients_org_idx').on(table.organizationId),
    // Member ID unique within organization
    memberIdOrgIdx: uniqueIndex('patients_member_id_org_idx').on(
      table.memberId,
      table.organizationId
    ),
    // Name search
    nameIdx: index('patients_name_idx').on(table.lastName, table.firstName),
  })
);

// Claims
export const claims = pgTable(
  'claims',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    claimNumber: varchar('claim_number', { length: 50 }).notNull(),
    patientId: uuid('patient_id')
      .notNull()
      .references(() => patients.id, { onDelete: 'restrict' }),
    providerId: uuid('provider_id')
      .notNull()
      .references(() => providers.id, { onDelete: 'restrict' }),
    diagnosisCode: varchar('diagnosis_code', { length: 20 }).notNull(),
    procedureCode: varchar('procedure_code', { length: 20 }),
    amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
    status: claimStatusEnum('status').notNull().default('submitted'),
    serviceDate: timestamp('service_date', { withTimezone: true }).notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    notes: text('notes'),
    assignedTo: uuid('assigned_to').references(() => users.id, { onDelete: 'set null' }),
    denialReason: text('denial_reason'),
    statusHistory: jsonb('status_history').notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // CRITICAL: Tenant filtering index (most important!)
    orgIdx: index('claims_org_idx').on(table.organizationId),
    // Composite index for common queries
    orgStatusIdx: index('claims_org_status_idx').on(table.organizationId, table.status),
    orgPatientIdx: index('claims_org_patient_idx').on(table.organizationId, table.patientId),
    orgProviderIdx: index('claims_org_provider_idx').on(table.organizationId, table.providerId),
    // Date range queries
    orgDateIdx: index('claims_org_date_idx').on(table.organizationId, table.serviceDate),
    orgCreatedIdx: index('claims_org_created_idx').on(table.organizationId, table.createdAt),
    // Amount range queries
    orgAmountIdx: index('claims_org_amount_idx').on(table.organizationId, table.amount),
    // Assignment queries
    assignedToIdx: index('claims_assigned_to_idx').on(table.assignedTo),
    // Claim number unique within organization
    claimNumberOrgIdx: uniqueIndex('claims_claim_number_org_idx').on(
      table.claimNumber,
      table.organizationId
    ),
  })
);

// Patient Status Events
export const patientStatusEvents = pgTable(
  'patient_status_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    patientId: uuid('patient_id')
      .notNull()
      .references(() => patients.id, { onDelete: 'cascade' }),
    statusType: patientStatusTypeEnum('status_type').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    details: jsonb('details').notNull().default({}),
    jobId: varchar('job_id', { length: 100 }),
    jobStatus: jobStatusEnum('job_status').default('pending'),
    jobCompletedAt: timestamp('job_completed_at', { withTimezone: true }),
    idempotencyKey: varchar('idempotency_key', { length: 100 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // Tenant filtering
    orgIdx: index('patient_status_org_idx').on(table.organizationId),
    // Patient history queries
    orgPatientIdx: index('patient_status_org_patient_idx').on(
      table.organizationId,
      table.patientId
    ),
    // Idempotency
    idempotencyOrgIdx: uniqueIndex('patient_status_idempotency_org_idx').on(
      table.idempotencyKey,
      table.organizationId
    ),
    // Date ordering
    occurredAtIdx: index('patient_status_occurred_at_idx').on(table.occurredAt),
  })
);

// Job Processing Logs (for idempotency)
export const jobProcessingLogs = pgTable(
  'job_processing_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    jobId: varchar('job_id', { length: 100 }).notNull(),
    jobType: varchar('job_type', { length: 50 }).notNull(),
    idempotencyKey: varchar('idempotency_key', { length: 100 }).notNull(),
    status: jobStatusEnum('status').notNull().default('pending'),
    payload: jsonb('payload').notNull(),
    result: jsonb('result'),
    error: text('error'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    retryCount: decimal('retry_count').notNull().default('0'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // Idempotency lookup
    idempotencyOrgIdx: uniqueIndex('job_logs_idempotency_org_idx').on(
      table.idempotencyKey,
      table.organizationId
    ),
    // Job status queries
    statusIdx: index('job_logs_status_idx').on(table.status),
  })
);

// Audit Logs
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    entityType: varchar('entity_type', { length: 50 }).notNull(),
    entityId: uuid('entity_id').notNull(),
    action: varchar('action', { length: 50 }).notNull(),
    performedBy: uuid('performed_by').notNull(),
    performedAt: timestamp('performed_at', { withTimezone: true }).notNull().defaultNow(),
    changes: jsonb('changes').notNull().default({}),
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // Entity lookup
    entityIdx: index('audit_logs_entity_idx').on(table.entityType, table.entityId),
    // Tenant filtering
    orgIdx: index('audit_logs_org_idx').on(table.organizationId),
    // Time-based queries
    performedAtIdx: index('audit_logs_performed_at_idx').on(table.performedAt),
  })
);

// Relations
export const organizationsRelations = relations(organizations, ({ many }) => ({
  users: many(users),
  providers: many(providers),
  patients: many(patients),
  claims: many(claims),
  patientStatusEvents: many(patientStatusEvents),
  jobProcessingLogs: many(jobProcessingLogs),
  auditLogs: many(auditLogs),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [users.organizationId],
    references: [organizations.id],
  }),
  provider: one(providers, {
    fields: [users.providerId],
    references: [providers.id],
  }),
  patient: one(patients, {
    fields: [users.patientId],
    references: [patients.id],
  }),
  assignedClaims: many(claims),
}));

export const providersRelations = relations(providers, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [providers.organizationId],
    references: [organizations.id],
  }),
  claims: many(claims),
}));

export const patientsRelations = relations(patients, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [patients.organizationId],
    references: [organizations.id],
  }),
  claims: many(claims),
  statusEvents: many(patientStatusEvents),
}));

export const claimsRelations = relations(claims, ({ one }) => ({
  organization: one(organizations, {
    fields: [claims.organizationId],
    references: [organizations.id],
  }),
  patient: one(patients, {
    fields: [claims.patientId],
    references: [patients.id],
  }),
  provider: one(providers, {
    fields: [claims.providerId],
    references: [providers.id],
  }),
  assignedUser: one(users, {
    fields: [claims.assignedTo],
    references: [users.id],
  }),
}));

export const patientStatusEventsRelations = relations(patientStatusEvents, ({ one }) => ({
  organization: one(organizations, {
    fields: [patientStatusEvents.organizationId],
    references: [organizations.id],
  }),
  patient: one(patients, {
    fields: [patientStatusEvents.patientId],
    references: [patients.id],
  }),
}));

// Type exports for use in application
export type OrganizationRow = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;

export type UserRow = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type ProviderRow = typeof providers.$inferSelect;
export type NewProvider = typeof providers.$inferInsert;

export type PatientRow = typeof patients.$inferSelect;
export type NewPatient = typeof patients.$inferInsert;

export type ClaimRow = typeof claims.$inferSelect;
export type NewClaim = typeof claims.$inferInsert;

export type PatientStatusEventRow = typeof patientStatusEvents.$inferSelect;
export type NewPatientStatusEvent = typeof patientStatusEvents.$inferInsert;

export type JobProcessingLogRow = typeof jobProcessingLogs.$inferSelect;
export type NewJobProcessingLog = typeof jobProcessingLogs.$inferInsert;

export type AuditLogRow = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
