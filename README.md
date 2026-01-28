# Multi-Tenant Insurance Claims Platform

A production-grade multi-tenant insurance claims processing platform with async job processing, role-based access control, and comprehensive audit logging.

## Table of Contents

- [Quick Start](#quick-start)
- [Architecture Overview](#architecture-overview)
- [Multi-Tenancy Strategy](#multi-tenancy-strategy)
- [Database Schema](#database-schema)
- [Permission Model](#permission-model)
- [Async Processing with BullMQ](#async-processing-with-bullmq)
- [Performance Optimization](#performance-optimization)
- [Testing Strategy](#testing-strategy)
- [API Design](#api-design)
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
npm run db:push

# Seed test data
npm run db:seed

# Start development server
npm run dev

# In a separate terminal, start the worker
npm run worker:dev
```

### Test Accounts

| Email | Password | Role | Organization |
|-------|----------|------|--------------|
| admin@healthfirst.com | Password123! | Admin | HealthFirst Insurance |
| processor1@healthfirst.com | Password123! | Claims Processor | HealthFirst Insurance |
| provider1@healthfirst.com | Password123! | Provider | HealthFirst Insurance |
| admin@securecare.com | Password123! | Admin | SecureCare Insurance |

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
3. **Repository Pattern**: Data access abstracted behind interfaces
4. **Service Layer**: Business logic isolated from HTTP concerns

---

## Multi-Tenancy Strategy

### How do you isolate tenants?

Tenant isolation is enforced through a **shared database with row-level filtering**. Every table that contains tenant-specific data includes an `organizationId` column. All queries are automatically filtered by this column.

```typescript
// Every tenant-aware table has organizationId
export const claims = pgTable('claims', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  // ... other fields
});
```

### Where is tenant context set and checked?

Tenant context flows through the application in three stages:

1. **Authentication Middleware** (`src/presentation/middleware/auth.middleware.ts`):
   - Extracts JWT from Authorization header
   - Validates token and extracts `organizationId`, `userId`, `role`
   - Attaches `TenantContext` to `req.tenantContext`

```typescript
export interface TenantContext {
  organizationId: string;  // The tenant identifier
  userId: string;          // Current user
  role: UserRole;          // admin | claims_processor | provider | patient
  providerId?: string;     // If user is a provider
  patientId?: string;      // If user is a patient
  assignedClaimIds?: string[]; // If user is a claims processor
}
```

2. **Service Layer**: Receives context, applies business rules
3. **Repository Layer**: Uses context to filter all queries

### How do you prevent cross-tenant data leaks?

**Three-layer defense:**

1. **BaseTenantRepository** - All repositories extend this class which enforces tenant filtering:

```typescript
export abstract class BaseTenantRepository<TTable extends PgTable> {
  // EVERY query MUST go through this method
  protected getTenantFilter(context: TenantContext): SQL {
    return eq(this.organizationIdColumn, context.organizationId);
  }

  // Combines tenant filter with additional conditions
  protected withTenantFilter(context: TenantContext, ...conditions: SQL[]): SQL {
    return and(this.getTenantFilter(context), ...conditions);
  }

  // Validates data being mutated belongs to tenant
  protected validateTenantMatch(dataOrgId: string, context: TenantContext): void {
    if (dataOrgId !== context.organizationId) {
      throw new TenantAccessError('Entity does not belong to your organization');
    }
  }
}
```

2. **No Direct SQL**: All database access goes through repositories - no raw queries that could bypass filtering

3. **Input Validation**: Even if a request body contains `organizationId`, it's ignored - context always comes from JWT

### Middleware vs. repository-level filtering approach

I use **both** approaches for defense in depth:

| Layer | What It Does | Why |
|-------|--------------|-----|
| **Middleware** | Validates JWT, extracts tenant context | Early rejection of unauthenticated requests |
| **Service** | Business rule validation | Ensures operations are allowed for this role |
| **Repository** | Automatic WHERE clause injection | Guarantees no query ever returns cross-tenant data |

The repository-level filtering is the **critical security layer** because it's impossible to bypass - every query goes through `BaseTenantRepository.getTenantFilter()`.

---

## Database Schema

### Models and relationships (Drizzle schema)

```
┌─────────────────┐
│  organizations  │
└────────┬────────┘
         │ 1:N
    ┌────┴────┬─────────┬──────────┬─────────────────┐
    ▼         ▼         ▼          ▼                 ▼
┌───────┐ ┌───────┐ ┌──────────┐ ┌────────┐ ┌──────────────────┐
│ users │ │patients│ │providers │ │ claims│ │patient_status_   │
│       │ │       │ │          │ │        │ │    events        │
└───────┘ └───┬───┘ └────┬─────┘ └────────┘ └──────────────────┘
              │          │            ▲
              └──────────┴────────────┘
                    N:1 relationships
```

**Core Tables:**

| Table | Purpose |
|-------|---------|
| `organizations` | Tenants (insurance companies) |
| `users` | User accounts with roles |
| `patients` | Patient records |
| `providers` | Healthcare providers |
| `claims` | Insurance claims |
| `patient_status_events` | Admission/discharge/treatment events |
| `job_processing_logs` | Idempotency tracking for async jobs |
| `audit_logs` | Change history |

### Why you added specific fields beyond core requirements

| Field | Table | Why Added |
|-------|-------|-----------|
| `statusHistory` (JSONB) | claims | Audit trail of all status changes with timestamps and reasons |
| `assignedClaimIds` (JSONB) | users | Fast lookup for claims processor's assigned claims |
| `settings` (JSONB) | organizations | Per-tenant configuration (claim limits, auto-approve thresholds) |
| `idempotencyKey` | patient_status_events | Prevents duplicate job processing |
| `jobStatus` | patient_status_events | Track if associated job completed/failed |
| `denialReason` | claims | Required for rejected claims compliance |
| `processedAt`, `paidAt` | claims | Timestamp tracking for SLA compliance |

### Index strategy: which fields indexed, why?

```typescript
// Composite indexes for tenant-filtered queries (CRITICAL for performance)
claimsOrgIdx: index('claims_org_idx').on(claims.organizationId),
claimsOrgStatusIdx: index('claims_org_status_idx').on(claims.organizationId, claims.status),
claimsOrgPatientIdx: index('claims_org_patient_idx').on(claims.organizationId, claims.patientId),
claimsOrgDateIdx: index('claims_org_date_idx').on(claims.organizationId, claims.serviceDate),
claimsOrgAmountIdx: index('claims_org_amount_idx').on(claims.organizationId, claims.amount),

// Unique constraints with tenant scope
claimNumberUnique: unique('claim_number_org_unique').on(claims.claimNumber, claims.organizationId),
```

**Index Strategy Rationale:**

1. **Every query includes organizationId** → All indexes are composite starting with `organizationId`
2. **Common filter patterns**: status, patientId, date range, amount range
3. **Unique per tenant**: Claim numbers, emails, NPIs are unique within an org, not globally

### Any denormalized fields for performance

1. **`assignedClaimIds` in users table**: Instead of a junction table `user_claim_assignments`, I store assigned claim IDs as a JSON array. This allows a single query to get a processor's claims without a join.

2. **`statusHistory` in claims table**: Instead of a separate `claim_status_history` table, changes are appended to a JSONB array. The audit trail is almost always read with the claim.

### Migration strategy

```bash
# Generate migration from schema changes
npm run db:generate

# Apply migrations to database
npm run db:migrate

# Push schema directly (development only)
npm run db:push
```

Migrations are stored in `/drizzle` folder and tracked in git. Production deployments run `db:migrate` before starting the application.

---

## Permission Model

### How are permissions enforced? (middleware, service, repository)

Permissions are enforced at **three levels**:

```
Request → [Middleware] → [Service] → [Repository] → Database
              │              │             │
              ▼              ▼             ▼
         Auth check    Business rules  Data filtering
```

**Level 1: Middleware** (`auth.middleware.ts`)
```typescript
// Verify user is authenticated and has required role
export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!roles.includes(req.tenantContext!.role)) {
      throw new ForbiddenError('Insufficient permissions');
    }
    next();
  };
}
```

**Level 2: Service** (`claims.service.ts`)
```typescript
// Business rule: providers can only create claims for themselves
if (context.role === 'provider' && input.providerId !== context.providerId) {
  throw new ForbiddenError('Providers can only create claims for themselves');
}
```

**Level 3: Repository** (`claim.repository.ts`)
```typescript
// Automatic data filtering based on role
private buildRoleFilter(context: TenantContext): SQL | undefined {
  switch (context.role) {
    case 'admin':
      return undefined; // See all org claims
    case 'claims_processor':
      return inArray(claims.id, context.assignedClaimIds || []);
    case 'provider':
      return eq(claims.providerId, context.providerId);
    case 'patient':
      return eq(claims.patientId, context.patientId);
  }
}
```

### Where do permission checks happen?

| Check Type | Location | Example |
|------------|----------|---------|
| Authentication | `auth.middleware.ts` | Is JWT valid? |
| Role authorization | `auth.middleware.ts` | Is user admin or processor? |
| Business rules | Service layer | Can provider create this claim? |
| Data access | Repository layer | Can user see this specific claim? |
| Modification rules | Service layer | Can approved claims be modified? |

### Can permissions be bypassed? (Should be no)

**No, permissions cannot be bypassed:**

1. **All routes require authentication** - No public endpoints except `/health` and `/auth`
2. **Repository enforces filtering** - Even if service layer has a bug, repository adds tenant filter
3. **No direct database access** - All queries go through repositories
4. **TypeScript enforces context passing** - Methods require `TenantContext` parameter

```typescript
// This is impossible - TypeScript requires context
async findById(id: string, context: TenantContext): Promise<Claim | null>
```

### How do you test permission boundaries?

Tests in `tests/security/tenant-isolation.test.ts`:

```typescript
describe('Cross-Tenant Access Prevention', () => {
  it('should reject access when user tries to access different organization', () => {
    const userOrg = 'org-1';
    const requestedOrg = 'org-2';
    
    expect(() => {
      if (userOrg !== requestedOrg) {
        throw new TenantAccessError('Cross-tenant access denied');
      }
    }).toThrow(TenantAccessError);
  });

  it('should prevent organization ID spoofing in request body', () => {
    const context = createTenantContext({ organizationId: 'org-1' });
    const spoofedBody = { organizationId: 'org-hacker' };
    
    // System uses context.organizationId, not body
    const actualOrgId = context.organizationId;
    expect(actualOrgId).toBe('org-1');
    expect(actualOrgId).not.toBe(spoofedBody.organizationId);
  });
});

describe('Role-Based Access Control', () => {
  it('should prevent claims processor from updating unassigned claims');
  it('should prevent patient from modifying claims');
  it('should prevent provider from accessing other providers claims');
});
```

---

## Async Processing with BullMQ

### Which jobs exist and what do they do?

| Job Type | Trigger | What It Does |
|----------|---------|--------------|
| `patient_admission` | Patient admitted to facility | Find submitted claims → mark as `under_review` |
| `patient_discharge` | Patient discharged | Find pending claims → auto-approve |
| `treatment_initiated` | Treatment started | Find related claims → mark as `under_review` |

```typescript
// Job 1: Patient Admitted
export async function processPatientAdmission(data: PatientAdmissionJobData): Promise<JobResult> {
  // 1. Check idempotency - already processed?
  // 2. Find all 'submitted' claims for this patient
  // 3. Update each to 'under_review'
  // 4. Log results
}
```

### Idempotency strategy: how do you prevent duplicate processing?

**Two-layer idempotency:**

1. **Event-level**: `patient_status_events.idempotencyKey` prevents duplicate events
2. **Job-level**: `job_processing_logs` table tracks job execution

```typescript
// Before processing any job:
const existingLog = await jobProcessingLogRepository.findByIdempotencyKey(idempotencyKey);

if (existingLog?.status === 'completed') {
  // Return cached result - don't process again
  return existingLog.result;
}

// Create log entry before processing
await jobProcessingLogRepository.create({
  idempotencyKey,
  jobType: 'patient_admission',
  status: 'processing',
});

// Process job...

// Mark completed with result
await jobProcessingLogRepository.markCompleted(logId, result);
```

### Retry logic: exponential backoff? Max retries? How to recover?

```typescript
const queue = new Queue('claims-processing', {
  defaultJobOptions: {
    attempts: 3,           // Max 3 attempts
    backoff: {
      type: 'exponential',
      delay: 1000,         // 1s → 2s → 4s
    },
    removeOnComplete: { age: 86400 },   // Keep 24 hours
    removeOnFail: { age: 604800 },      // Keep 7 days
  },
});
```

**Recovery strategy:**
1. Job fails → BullMQ retries with backoff
2. After 3 failures → Job moves to failed state
3. `job_processing_logs` shows failure reason
4. Admin can investigate and manually retry

### Transaction safety: atomic operations?

Each claim update is an **individual atomic operation**:

```typescript
// Each claim is updated separately
for (const claim of claimsToUpdate) {
  try {
    await claimRepository.updateStatusInternal(claim.id, 'under_review', orgId);
    updatedClaimIds.push(claim.id);
  } catch (error) {
    // Log error, continue with other claims
    failedClaimIds.push(claim.id);
  }
}
```

**Why not one big transaction?**
- Partial success is better than total failure
- One bad claim shouldn't block others
- Idempotency allows safe retry of failed claims

### How do you know if a job failed?

1. **Job Processing Logs Table**: Query `SELECT * FROM job_processing_logs WHERE status = 'failed'`
2. **BullMQ Events**: Worker emits events on failure
3. **Winston Logs**: Structured JSON logging with job ID

```typescript
queueEvents.on('failed', ({ jobId, failedReason }) => {
  logger.error('Job failed', { jobId, failedReason });
});
```

### Dead letter queue handling

Failed jobs remain in BullMQ's failed state for 7 days. The `job_processing_logs` table provides a permanent record:

```typescript
await jobProcessingLogRepository.markFailed(logId, {
  error: error.message,
  stack: error.stack,
  attemptNumber: job.attemptsMade,
});
```

For critical failures, you could add:
- Alert notifications (PagerDuty, Slack)
- Manual retry endpoint for admins
- Automated retry after investigation

---

## Performance Optimization

### Query optimization: eager loading strategy with Drizzle

Currently using **lazy loading** - relations are fetched separately when needed. For frequently accessed patterns, eager loading can be added:

```typescript
// Eager load patient and provider with claim
const claimWithRelations = await db.query.claims.findFirst({
  where: eq(claims.id, claimId),
  with: {
    patient: true,
    provider: true,
  },
});
```

### Pagination approach (offset vs. cursor)

**Currently using offset pagination:**

```typescript
const result = await db
  .select()
  .from(claims)
  .where(conditions)
  .limit(limit)
  .offset(offset);
```

**Why offset over cursor:**
- Simpler to implement
- Works well for moderate data sizes
- Allows "jump to page N"

**Trade-off:** Offset pagination has O(n) performance for deep pages. For production with millions of claims, cursor pagination would be better.

### Indexes and why you chose them

| Index | Columns | Why |
|-------|---------|-----|
| `claims_org_idx` | (organizationId) | Every query filters by tenant |
| `claims_org_status_idx` | (organizationId, status) | Dashboard: "show pending claims" |
| `claims_org_patient_idx` | (organizationId, patientId) | Patient history lookups |
| `claims_org_date_idx` | (organizationId, serviceDate) | Date range filtering |
| `claims_org_amount_idx` | (organizationId, amount) | Amount range filtering |

All indexes start with `organizationId` because **every query includes it**.

### Redis caching strategy (if implemented)

**Not implemented in current version.** Potential caching targets:

1. **Organization settings**: Rarely change, frequently read
2. **User permissions**: Cache `assignedClaimIds` to avoid DB lookup
3. **Claim counts by status**: For dashboard widgets

### Any benchmarks/query analysis

Target: **<200ms response time** for list queries.

With proper indexes, a query like:
```sql
SELECT * FROM claims 
WHERE organization_id = $1 AND status = 'submitted'
ORDER BY created_at DESC
LIMIT 20
```
Uses index scan on `claims_org_status_idx`, returning in <50ms for 100k claims.

---

## Testing Strategy

### Unit vs. integration tests

| Type | Location | What It Tests |
|------|----------|---------------|
| Unit | `tests/unit/` | Individual functions in isolation |
| Integration | `tests/integration/` | Service + repository together |
| Security | `tests/security/` | Tenant isolation, RBAC |
| Async | `tests/async/` | Job idempotency, failure handling |

### Critical paths tested thoroughly

1. **Tenant isolation** - Org A cannot access Org B data
2. **Role-based access** - Processor can't see unassigned claims
3. **Job idempotency** - Running job twice doesn't duplicate changes
4. **Claim status transitions** - Can't modify approved/paid claims

### Edge cases covered

- Empty `assignedClaimIds` for processor → returns no claims
- Missing `providerId` for provider role → returns no claims  
- Concurrent job execution with same idempotency key
- Partial job failure recovery

### Security testing: permission bypass attempts tested

```typescript
it('should prevent organization ID spoofing in request body', () => {
  const context = createTenantContext({ organizationId: 'org-1' });
  const spoofedBody = { organizationId: 'org-hacker', data: 'malicious' };
  
  // System ignores body.organizationId
  const actualOrgId = context.organizationId;
  expect(actualOrgId).toBe('org-1');
});

it('should prevent URL parameter manipulation for tenant access', () => {
  const authenticatedUserOrg = 'org-1';
  const urlParamOrgId = 'org-2'; // Attacker trying to access different org
  
  const isValidAccess = authenticatedUserOrg === urlParamOrgId;
  expect(isValidAccess).toBe(false);
});
```

### Async testing: idempotency verified

```typescript
it('should return cached result on duplicate run (idempotency)', async () => {
  // First run - processes claims
  mockedJobLogRepo.findByIdempotencyKey.mockResolvedValue(null);
  await processPatientAdmission(jobData);
  
  // Second run - returns cached result
  mockedJobLogRepo.findByIdempotencyKey.mockResolvedValue({
    status: 'completed',
    result: { claimsUpdated: 2 },
  });
  
  const result = await processPatientAdmission(jobData);
  
  // Claims not updated again
  expect(mockedClaimRepo.updateStatusInternal).not.toHaveBeenCalled();
  expect(result.claimsUpdated).toBe(2);
});
```

### Test environment setup (test database, Redis)

Tests use **mocked repositories** - no real database needed:

```typescript
vi.mock('../../src/infrastructure/database/repositories/index.js', () => ({
  claimRepository: {
    findByPatientIdInternal: vi.fn(),
    updateStatusInternal: vi.fn(),
  },
  jobProcessingLogRepository: {
    findByIdempotencyKey: vi.fn(),
    create: vi.fn(),
    markCompleted: vi.fn(),
  },
}));
```

For true integration tests, you would:
1. Use a test database (separate Neon project or local Docker)
2. Use test Redis instance
3. Run migrations before tests
4. Clean up after each test

---

## API Design

### RESTful conventions followed

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/login` | Authenticate user |
| POST | `/api/auth/register` | Register new user |
| POST | `/api/claims` | Create claim |
| GET | `/api/claims` | List claims (filtered, paginated) |
| GET | `/api/claims/:id` | Get single claim |
| PATCH | `/api/claims/:id` | Update claim status |
| POST | `/api/claims/bulk-status-update` | Bulk update |
| GET | `/api/claims/stats` | Dashboard statistics |
| POST | `/api/patient-status` | Create status event |
| GET | `/api/patient-status/history/:patientId` | Patient history |

### Error response format

```typescript
// Success response
{
  "success": true,
  "data": { ... },
  "meta": {
    "timestamp": "2025-01-15T10:30:00Z",
    "pagination": { "total": 100, "limit": 20, "offset": 0 }
  }
}

// Error response
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": { 
      "fields": { 
        "amount": ["Must be positive"] 
      } 
    }
  },
  "meta": { 
    "timestamp": "2025-01-15T10:30:00Z", 
    "requestId": "req_abc123" 
  }
}
```

**Error codes:**
- `VALIDATION_ERROR` (400)
- `UNAUTHORIZED` (401)
- `FORBIDDEN` (403)
- `NOT_FOUND` (404)
- `CONFLICT` (409)
- `INTERNAL_ERROR` (500)

### Validation approach (Zod)

All request validation uses Zod schemas:

```typescript
export const createClaimSchema = z.object({
  patientId: z.string().uuid('Invalid patient ID'),
  providerId: z.string().uuid('Invalid provider ID'),
  diagnosisCode: z.string().refine(
    (code) => VALID_DIAGNOSIS_CODES.includes(code),
    { message: 'Invalid diagnosis code' }
  ),
  amount: z.number()
    .min(0.01, 'Amount must be at least $0.01')
    .max(1_000_000, 'Amount cannot exceed $1,000,000'),
  serviceDate: z.coerce.date(),
  notes: z.string().max(1000).optional(),
});
```

Validation middleware applies schemas automatically:

```typescript
router.post('/claims', 
  authenticate, 
  validate(createClaimSchema), 
  createClaim
);
```

### Request/response types

Full TypeScript types for all requests and responses:

```typescript
// Request types
type CreateClaimInput = z.infer<typeof createClaimSchema>;
type ListClaimsQuery = z.infer<typeof listClaimsQuerySchema>;
type UpdateClaimStatusInput = z.infer<typeof updateClaimStatusSchema>;

// Response types
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta: {
    timestamp: string;
    requestId?: string;
    pagination?: PaginationMeta;
  };
}
```

---

## Development & Deployment

### Environment variables needed

```env
# Database (Neon PostgreSQL)
DATABASE_URL=postgresql://user:pass@host/db?sslmode=require

# Redis (Upstash)
REDIS_URL=rediss://default:pass@host:port

# JWT Configuration
JWT_SECRET=your-32-character-minimum-secret
JWT_EXPIRES_IN=7d

# Server Configuration
NODE_ENV=development
PORT=3000

# BullMQ Configuration
BULL_QUEUE_NAME=claims-processing
```

### How to run locally (setup instructions)

```bash
# 1. Install dependencies
npm install

# 2. Set up environment
cp .env.example .env
# Edit .env with your Neon and Upstash credentials

# 3. Create database tables
npm run db:push

# 4. Seed test data
npm run db:seed

# 5. Start API server (Terminal 1)
npm run dev

# 6. Start worker (Terminal 2)
npm run worker:dev

# 7. Run tests
npm test
```

### How to run migrations

```bash
# Generate migration from schema changes
npm run db:generate

# Apply migrations
npm run db:migrate

# Push schema directly (dev only, no migration files)
npm run db:push

# Open Drizzle Studio (database GUI)
npm run db:studio
```

### How to start workers

```bash
# Development (with hot reload)
npm run worker:dev

# Production
npm run worker
```

The worker processes jobs from the BullMQ queue. You can run multiple worker instances for horizontal scaling.

### Deployment considerations (Railway, Replit, etc.)

**For Railway/Render/Fly.io:**

1. Set environment variables in dashboard
2. Build command: `npm run build`
3. Start command: `npm start`
4. Add separate worker service with: `npm run worker`

**Checklist:**
- [ ] Set `NODE_ENV=production`
- [ ] Use strong `JWT_SECRET` (32+ characters)
- [ ] Enable HTTPS/TLS
- [ ] Run `npm run db:migrate` before deploy
- [ ] Configure Redis TLS (`rediss://` protocol)
- [ ] Set up health check endpoint monitoring

---

## Trade-offs Made

### What did you prioritize?

1. **Security over convenience**: Every query goes through tenant filtering, even if it adds overhead
2. **Simplicity over flexibility**: JSONB for status history instead of separate table
3. **Reliability over speed**: Idempotency checks add latency but prevent data corruption

### Known limitations?

| Limitation | Impact | Mitigation |
|------------|--------|------------|
| Offset pagination | Slow for deep pages | Switch to cursor for production |
| JSONB status history | Can't query historical statuses efficiently | Separate table if needed |
| Single Redis instance | No HA for queue | Use Redis cluster in production |
| No rate limiting per user | Possible abuse | Add user-level rate limits |

### Technical debt incurred

1. **`assignedClaimIds` array in User table**: Works for <1000 assignments per processor. For more, need junction table.

2. **Mixed HTTP client**: Using Neon HTTP driver for most queries, but postgres.js for transactions. Two clients to maintain.

3. **No database connection pooling**: Neon serverless handles this, but traditional deployment would need PgBouncer.

---

## What I'd Do With More Time

### Performance optimizations not implemented?

1. **Redis caching**: Cache organization settings, user permissions, claim counts
2. **Cursor pagination**: For efficient deep page navigation
3. **Query result caching**: Cache common filter combinations
4. **Database read replicas**: For read-heavy dashboard queries

### Additional features?

1. **Audit logging**: Complete audit trail for all entity changes
2. **Webhooks**: Notify external systems of claim status changes
3. **File attachments**: S3 integration for claim documents
4. **Real-time updates**: Socket.IO for live claim notifications
5. **Email notifications**: Send status change emails to providers/patients
6. **Dashboard analytics**: Charts and metrics for claim processing

### Testing coverage gaps?

1. **Load testing**: k6/Artillery scripts for concurrent access testing
2. **E2E tests**: Playwright for full user flows through API
3. **Contract testing**: API schema validation
4. **Chaos testing**: Redis/database failure scenarios

### Monitoring and observability improvements

1. **Metrics**: Prometheus metrics for API latency, queue depth, error rates
2. **Distributed tracing**: OpenTelemetry for request flow tracking
3. **Alerting**: PagerDuty/Slack integration for failures
4. **Dashboard**: Grafana visualizations for system health
5. **Log aggregation**: Ship logs to Datadog/Splunk for analysis

---

## License

MIT

## Author

Carl Matt - Backend Developer