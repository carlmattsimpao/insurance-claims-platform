# Multi-Tenant Insurance Claims Platform

A production-grade multi-tenant insurance claims processing platform with async job processing, role-based access control, and comprehensive audit logging.

## Table of Contents
- [Quick Start](#quick-start)
- [Architecture Overview](#architecture-overview)
- [Multi-Tenancy Strategy](#multi-tenancy-strategy)
- [Database Schema](#database-schema)
- [Permission Model](#permission-model)
- [Async Processing with BullMQ](#async-processing-with-bullmq)
- [API Design](#api-design)
- [Testing Strategy](#testing-strategy)
- [Development & Deployment](#development--deployment)
- [Trade-offs Made](#trade-offs-made)
- [What I'd Do With More Time](#what-id-do-with-more-time)

---

## Quick Start

### Prerequisites
- Node.js 20+
- PostgreSQL (Neon)
- Redis (Upstash)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd insurance-claims-platform

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env
# Edit .env with your database and Redis URLs

# Run database migrations
npm run db:migrate

# Seed test data (optional)
npm run db:seed

# Start development server
npm run dev

# In a separate terminal, start the worker
npm run worker:dev
```

### Environment Variables

```env
DATABASE_URL=postgresql://user:pass@host/db
REDIS_URL=rediss://user:pass@host:port
JWT_SECRET=your-32-character-minimum-secret-key
JWT_EXPIRES_IN=7d
NODE_ENV=development
PORT=3000
BULL_QUEUE_NAME=claims-processing
```

---

## Architecture Overview

This project follows **Clean Architecture** principles with clear separation of concerns:

```
src/
├── config/                 # Environment validation (Zod)
├── domain/                 # Business entities & interfaces (no external deps)
│   ├── entities/           # Claim, Patient, User, Organization, etc.
│   ├── repositories/       # Repository interfaces
│   └── errors/             # Custom domain errors
├── application/            # Use cases & business logic
│   ├── services/           # ClaimsService, PatientStatusService
│   └── validators/         # Zod schemas for request validation
├── infrastructure/         # External concerns
│   ├── database/           # Drizzle ORM, repositories
│   │   ├── schema/         # Database schema definitions
│   │   └── repositories/   # Repository implementations
│   ├── queue/              # BullMQ workers & jobs
│   └── auth/               # JWT authentication
├── presentation/           # API layer
│   ├── routes/             # Express routes
│   ├── controllers/        # HTTP handlers
│   └── middleware/         # Auth, validation, rate limiting
└── shared/                 # Cross-cutting concerns
    ├── types/              # TypeScript types
    └── utils/              # Logger, helpers
```

### Key Design Principles

1. **Dependency Inversion**: Domain layer has no external dependencies
2. **Single Responsibility**: Each layer has a specific purpose
3. **Open/Closed**: Easy to extend without modifying existing code
4. **Tenant Isolation**: All data access automatically filtered by organization

---

## Multi-Tenancy Strategy

### How Tenants Are Isolated

**Every table has `organizationId`** as a required column with a composite index:

```typescript
// All tables include:
organizationId: uuid('organization_id')
  .notNull()
  .references(() => organizations.id)

// Index for performance:
index('table_org_idx').on(table.organizationId)
```

### Where Tenant Context Is Set

1. **JWT Token**: Contains `organizationId`, `userId`, `role`
2. **Auth Middleware**: Extracts and validates token, creates `TenantContext`
3. **Request Object**: Context attached to `req.tenantContext`

```typescript
// Middleware flow:
authenticate → verifyToken → getTenantContext → req.tenantContext
```

### How Cross-Tenant Leaks Are Prevented

**Three-Layer Security Model:**

```
┌─────────────────────────────────────────────────────────┐
│ Layer 1: Middleware (Authentication)                     │
│ - Validates JWT token                                    │
│ - Extracts organization from token                       │
│ - Rejects invalid/expired tokens                         │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│ Layer 2: Service (Business Rules)                        │
│ - Permission checks (PermissionHelper)                   │
│ - Role-based access validation                           │
│ - Business logic enforcement                             │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│ Layer 3: Repository (Data Access)                        │
│ - AUTOMATIC tenant filtering via BaseTenantRepository    │
│ - No manual WHERE clauses needed                         │
│ - Impossible to bypass                                   │
└─────────────────────────────────────────────────────────┘
```

**BaseTenantRepository** (Critical Security Component):

```typescript
// All repositories extend this base class
abstract class BaseTenantRepository<TTable> {
  // Automatically adds organizationId filter to ALL queries
  protected getTenantFilter(context: TenantContext): SQL {
    return eq(this.organizationIdColumn, context.organizationId);
  }

  // Combines tenant filter with additional conditions
  protected withTenantFilter(context: TenantContext, ...conditions: SQL[]): SQL {
    return and(this.getTenantFilter(context), ...conditions);
  }

  // Validates data before mutations
  protected validateTenantMatch(dataOrgId: string, context: TenantContext) {
    if (dataOrgId !== context.organizationId) {
      throw new TenantAccessError('Cross-tenant access denied');
    }
  }
}
```

**Why This Approach:**
- ✅ Automatic - no developer can forget to add filter
- ✅ Consistent - same pattern across all repositories
- ✅ Testable - can verify filter is always applied
- ✅ Performant - composite indexes optimize filtered queries

---

## Database Schema

### Entity Relationship Diagram

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ Organization │────<│    Users     │     │  Providers   │
│    (Tenant)  │     │              │     │              │
└──────────────┘     └──────────────┘     └──────────────┘
       │                    │                    │
       │                    │                    │
       ├────────────────────┼────────────────────┘
       │                    │
       ▼                    ▼
┌──────────────┐     ┌──────────────┐
│   Patients   │────<│    Claims    │
│              │     │              │
└──────────────┘     └──────────────┘
       │                    │
       ▼                    │
┌──────────────┐            │
│PatientStatus │            │
│   Events     │            │
└──────────────┘            │
       │                    │
       ▼                    ▼
┌──────────────┐     ┌──────────────┐
│  Job Logs    │     │ Audit Logs   │
│(Idempotency) │     │              │
└──────────────┘     └──────────────┘
```

### Key Tables & Fields

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `organizations` | Tenants | `code` (unique), `settings` (JSON) |
| `users` | All users | `role`, `assignedClaimIds` (JSON array) |
| `claims` | Insurance claims | `status`, `statusHistory` (JSON audit trail) |
| `patient_status_events` | Status changes | `statusType`, `idempotencyKey` |
| `job_processing_logs` | Job tracking | `idempotencyKey`, `status`, `result` |

### Why Specific Fields Were Added

1. **`assignedClaimIds` on Users**: Denormalized for performance. Claims processors need fast lookup of their assigned claims without a join.

2. **`statusHistory` on Claims**: JSONB array instead of separate table. Simpler schema, sufficient for audit needs, keeps related data together.

3. **`idempotencyKey` on Events/Jobs**: Essential for safe retries. Allows us to detect and skip duplicate job executions.

### Index Strategy

```typescript
// Tenant filtering (MOST IMPORTANT)
index('claims_org_idx').on(claims.organizationId)

// Common queries
index('claims_org_status_idx').on(claims.organizationId, claims.status)
index('claims_org_patient_idx').on(claims.organizationId, claims.patientId)
index('claims_org_date_idx').on(claims.organizationId, claims.serviceDate)

// Unique constraints within tenant
uniqueIndex('claims_claim_number_org_idx').on(claims.claimNumber, claims.organizationId)
```

**Why These Indexes:**
- All queries filter by `organizationId` first, so it's the leading column
- Composite indexes support both equality on org + range on other fields
- Unique constraints are tenant-scoped (same claim number can exist in different orgs)

---

## Permission Model

### Role Definitions

| Role | View Claims | Create | Update Status | Scope |
|------|-------------|--------|---------------|-------|
| `admin` | ✅ All | ✅ | ✅ All | Entire organization |
| `claims_processor` | ✅ Assigned only | ✅ | ✅ Assigned only | Assigned claims |
| `provider` | ✅ Own only | ✅ Self only | ❌ | Claims they submitted |
| `patient` | ✅ Own only | ❌ | ❌ | Claims about them |

### Permission Enforcement Layers

**1. Middleware Level** (`auth.middleware.ts`):
```typescript
// Role-based route guards
requireAdmin         // Only admin
requireClaimsAccess  // admin, claims_processor
requireProvider      // admin, claims_processor, provider
requireAuthenticated // Any authenticated user
```

**2. Service Level** (`claims.service.ts`):
```typescript
// Business rule validation
PermissionHelper.requirePermission(
  PermissionHelper.canUpdateClaimStatus(context.role),
  'update claim status',
  context.role
);
```

**3. Repository Level** (`claim.repository.ts`):
```typescript
// Automatic data filtering based on role
private buildRoleFilter(context: TenantContext): SQL | undefined {
  switch (context.role) {
    case 'admin':
      return undefined; // See all org claims
    case 'claims_processor':
      return inArray(claims.id, context.assignedClaimIds); // Only assigned
    case 'provider':
      return eq(claims.providerId, context.providerId); // Only own
    case 'patient':
      return eq(claims.patientId, context.patientId); // Only own
  }
}
```

### Can Permissions Be Bypassed?

**No.** Here's why:

1. **URL Parameter Manipulation**: Even if user changes `/api/claims/:id`, the repository filter ensures they can only see claims matching their role.

2. **Request Body Spoofing**: Organization ID is NEVER taken from request body - always from JWT.

3. **Token Forgery**: JWT is signed with server secret, tampering detected.

---

## Async Processing with BullMQ

### Job Types

| Job | Trigger | Effect |
|-----|---------|--------|
| `patient_admission` | Patient admitted | Submitted → Under Review |
| `patient_discharge` | Patient discharged | Under Review → Approved |
| `treatment_initiated` | Treatment started | Submitted → Under Review |

### How Jobs Work

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  POST /api/  │     │   BullMQ     │     │   Worker     │
│patient-status│────>│    Queue     │────>│   Process    │
└──────────────┘     └──────────────┘     └──────────────┘
       │                                         │
       │                                         ▼
       │                                  ┌──────────────┐
       │                                  │ Update Claims│
       │                                  │ Log Results  │
       │                                  └──────────────┘
       │                                         │
       │                                         ▼
       ▼                                  ┌──────────────┐
┌──────────────┐                          │ Mark Job     │
│Return Event  │<─────────────────────────│ Complete     │
│    202       │                          └──────────────┘
└──────────────┘
```

### Idempotency Strategy

**Problem**: Jobs may run multiple times due to retries, crashes, or network issues.

**Solution**: Track job execution in `job_processing_logs` table:

```typescript
async function processPatientAdmission(data: JobData) {
  // 1. Check if already processed
  const existingLog = await jobProcessingLogRepository.findByIdempotencyKey(
    data.idempotencyKey,
    data.organizationId
  );

  if (existingLog?.status === 'completed') {
    // Return cached result - no duplicate processing
    return existingLog.result;
  }

  // 2. Create/get job log
  const jobLog = existingLog || await jobProcessingLogRepository.create({
    idempotencyKey: data.idempotencyKey,
    status: 'processing',
    ...
  });

  try {
    // 3. Do the work
    const result = await processClaimsForPatient(data.patientId);
    
    // 4. Mark complete with result
    await jobProcessingLogRepository.markCompleted(jobLog.id, result);
    return result;
  } catch (error) {
    // 5. Mark failed
    await jobProcessingLogRepository.markFailed(jobLog.id, error.message);
    throw error;
  }
}
```

**Key Insight**: Each claim update is atomic. If job fails mid-way, some claims may be updated. Retry will skip already-updated claims (via idempotency key check).

### Retry Configuration

```typescript
const queue = new Queue('claims-processing', {
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000, // 1s, 2s, 4s
    },
    removeOnComplete: { age: 86400 }, // 24 hours
    removeOnFail: { age: 604800 }, // 7 days
  },
});
```

### How to Know if a Job Failed

1. **Job Processing Logs Table**: Query for `status = 'failed'`
2. **BullMQ Dashboard**: Use Bull Board or similar
3. **Logs**: Winston logs with job ID and error details

---

## API Design

### RESTful Conventions

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/claims` | Create claim |
| GET | `/api/claims` | List claims (filtered, paginated) |
| GET | `/api/claims/:id` | Get single claim |
| PATCH | `/api/claims/:id` | Update claim status |
| POST | `/api/claims/bulk-status-update` | Bulk update |
| POST | `/api/patient-status` | Create status event |
| GET | `/api/patient-status/history/:patientId` | Patient history |

### Response Format

```typescript
// Success
{
  "success": true,
  "data": { ... },
  "meta": {
    "timestamp": "2024-01-15T10:30:00Z",
    "pagination": { "total": 100, "limit": 20, "offset": 0 }
  }
}

// Error
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": { "fields": { "amount": ["Must be positive"] } }
  },
  "meta": { "timestamp": "...", "requestId": "req_abc123" }
}
```

### Validation (Zod)

```typescript
export const createClaimSchema = z.object({
  patientId: z.string().uuid(),
  providerId: z.string().uuid(),
  diagnosisCode: z.enum(VALID_DIAGNOSIS_CODES),
  amount: z.number().min(0.01).max(1_000_000),
  serviceDate: z.coerce.date(),
});
```

---

## Testing Strategy

### Test Categories

| Category | What It Tests | Files |
|----------|---------------|-------|
| Security | Tenant isolation, RBAC | `tests/security/*.test.ts` |
| Integration | Full request/response cycle | `tests/integration/*.test.ts` |
| Unit | Individual services/repos | `tests/unit/*.test.ts` |

### Critical Tests

**1. Tenant Isolation**
```typescript
it('should prevent Tenant A from accessing Tenant B data', async () => {
  const tenantAToken = await loginAs(tenantA.admin);
  const tenantBClaimId = tenantB.claims[0].id;

  const response = await request(app)
    .get(`/api/claims/${tenantBClaimId}`)
    .set('Authorization', `Bearer ${tenantAToken}`);

  expect(response.status).toBe(404); // Not found, not 403
});
```

**2. Permission Boundaries**
```typescript
it('should prevent claims processor from updating unassigned claims', async () => {
  const processor = await createProcessor({ assignedClaimIds: [] });
  const token = await login(processor);
  const unassignedClaim = await createClaim();

  const response = await request(app)
    .patch(`/api/claims/${unassignedClaim.id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ status: 'approved' });

  expect(response.status).toBe(404); // Can't even see it
});
```

**3. Job Idempotency**
```typescript
it('should not process job twice', async () => {
  const jobData = { idempotencyKey: 'unique-key-123', ... };

  // First run
  const result1 = await processPatientAdmission(jobData);
  
  // Second run (simulating retry)
  const result2 = await processPatientAdmission(jobData);

  expect(result1).toEqual(result2);
  
  // Verify only processed once
  const logs = await getJobLogs(jobData.idempotencyKey);
  expect(logs.filter(l => l.status === 'completed')).toHaveLength(1);
});
```

### Running Tests

```bash
# All tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

---

## Development & Deployment

### Local Development

```bash
# Terminal 1: API Server
npm run dev

# Terminal 2: Queue Worker
npm run worker:dev

# Database tools
npm run db:studio  # Drizzle Studio
```

### Database Migrations

```bash
# Generate migration from schema changes
npm run db:generate

# Apply migrations
npm run db:migrate

# Push schema directly (dev only)
npm run db:push
```

### Production Deployment

**Environment Requirements:**
- Node.js 20+
- PostgreSQL 14+ (Neon recommended)
- Redis 6+ (Upstash recommended)

**Deployment Checklist:**
1. Set `NODE_ENV=production`
2. Use strong `JWT_SECRET` (32+ characters)
3. Enable HTTPS (SSL/TLS)
4. Configure Redis TLS (`rediss://`)
5. Run migrations before deployment

---

## Trade-offs Made

### 1. Assigned Claims in User Table

**Choice**: Store `assignedClaimIds` as JSON array on User instead of junction table.

**Trade-off**:
- ✅ Fast lookup for processor's assigned claims (single query)
- ❌ Can't easily query "who is assigned to claim X"
- ❌ Array size limit (practical max ~1000 assignments)

**Why**: Claims processors typically have 10-100 assigned claims. Performance for their view is critical.

### 2. Status History as JSONB

**Choice**: Store claim status changes in `statusHistory` JSONB array instead of separate table.

**Trade-off**:
- ✅ Simpler schema, faster reads
- ❌ Harder to query "all claims that were rejected then approved"
- ❌ No referential integrity

**Why**: Audit trail is append-only and almost always read with the claim.

### 3. Neon HTTP + postgres.js for Transactions

**Choice**: Use Neon HTTP driver for most queries, postgres.js for transactions.

**Trade-off**:
- ✅ Serverless-friendly (no connection pooling needed)
- ✅ Full transaction support when needed
- ❌ Two database clients to maintain

**Why**: Neon HTTP doesn't support multi-statement transactions, but we need them for atomic operations.

---

## What I'd Do With More Time

### Performance Optimizations

1. **Redis Caching**: Cache frequently accessed claims, organization settings
2. **Query Optimization**: Add materialized views for dashboard stats
3. **Connection Pooling**: Use PgBouncer for high-load scenarios

### Additional Features

1. **Audit Logging**: Complete audit trail for all entity changes
2. **Webhooks**: Notify external systems of claim status changes
3. **Real-time Updates**: Socket.IO for live claim updates
4. **File Attachments**: S3 integration for claim documents

### Testing Gaps

1. **Load Testing**: k6/Artillery scripts for concurrent access
2. **Contract Testing**: API schema validation
3. **E2E Tests**: Playwright for full user flows

### Monitoring & Observability

1. **Metrics**: Prometheus metrics for API latency, queue depth
2. **Tracing**: OpenTelemetry distributed tracing
3. **Alerting**: PagerDuty integration for failures
4. **Dashboard**: Grafana visualizations

---

## License

MIT

## Author

Carl Matt - QA Team Lead & Backend Developer
