import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Insurance Claims Platform API',
      version: '1.0.0',
      description: `
## Multi-Tenant Insurance Claims Platform

A production-grade API for managing insurance claims with:
- **Multi-tenant isolation** - Each organization sees only their data
- **Role-based access control** - Admin, Claims Processor, Provider, Patient
- **Async processing** - Background jobs for claim status updates

### Authentication
All endpoints (except /health and /auth) require a Bearer token:
\`\`\`
Authorization: Bearer <your-jwt-token>
\`\`\`

### Rate Limiting
- Standard endpoints: 100 requests per minute
- Auth endpoints: 10 requests per 15 minutes
- Bulk operations: 10 requests per minute
      `,
      contact: {
        name: 'Carl Matt',
        email: 'carl@example.com',
      },
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter your JWT token',
        },
      },
      schemas: {
        // Common schemas
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: {
              type: 'object',
              properties: {
                code: { type: 'string', example: 'VALIDATION_ERROR' },
                message: { type: 'string', example: 'Request validation failed' },
                details: { type: 'object' },
              },
            },
            meta: {
              type: 'object',
              properties: {
                timestamp: { type: 'string', format: 'date-time' },
                requestId: { type: 'string' },
              },
            },
          },
        },

        // Auth schemas
        LoginRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email', example: 'admin@healthfirst.com' },
            password: { type: 'string', minLength: 8, example: 'Password123!' },
          },
        },
        LoginResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                accessToken: { type: 'string' },
                expiresIn: { type: 'string', example: '7d' },
                user: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    email: { type: 'string' },
                    firstName: { type: 'string' },
                    lastName: { type: 'string' },
                    role: { type: 'string', enum: ['admin', 'claims_processor', 'provider', 'patient'] },
                  },
                },
              },
            },
          },
        },

        // Claim schemas
        Claim: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            claimNumber: { type: 'string', example: 'CLM-ORG1-ABC123' },
            organizationId: { type: 'string', format: 'uuid' },
            patientId: { type: 'string', format: 'uuid' },
            providerId: { type: 'string', format: 'uuid' },
            diagnosisCode: { type: 'string', example: 'J06.9' },
            procedureCode: { type: 'string', example: '99213' },
            amount: { type: 'number', example: 250.00 },
            status: { 
              type: 'string', 
              enum: ['submitted', 'under_review', 'approved', 'rejected', 'paid'],
              example: 'submitted'
            },
            serviceDate: { type: 'string', format: 'date' },
            submittedAt: { type: 'string', format: 'date-time' },
            processedAt: { type: 'string', format: 'date-time' },
            paidAt: { type: 'string', format: 'date-time' },
            notes: { type: 'string' },
            denialReason: { type: 'string' },
            assignedTo: { type: 'string', format: 'uuid' },
            statusHistory: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  from: { type: 'string' },
                  to: { type: 'string' },
                  changedAt: { type: 'string', format: 'date-time' },
                  changedBy: { type: 'string', format: 'uuid' },
                  reason: { type: 'string' },
                },
              },
            },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        CreateClaimRequest: {
          type: 'object',
          required: ['patientId', 'providerId', 'diagnosisCode', 'amount', 'serviceDate'],
          properties: {
            patientId: { type: 'string', format: 'uuid' },
            providerId: { type: 'string', format: 'uuid' },
            diagnosisCode: { 
              type: 'string', 
              description: 'Valid ICD-10 code',
              example: 'J06.9' 
            },
            procedureCode: { type: 'string', example: '99213' },
            amount: { 
              type: 'number', 
              minimum: 0.01, 
              maximum: 1000000,
              example: 250.00 
            },
            serviceDate: { type: 'string', format: 'date', example: '2025-01-15' },
            notes: { type: 'string', maxLength: 1000 },
          },
        },
        UpdateClaimStatusRequest: {
          type: 'object',
          required: ['status'],
          properties: {
            status: { 
              type: 'string', 
              enum: ['submitted', 'under_review', 'approved', 'rejected', 'paid'] 
            },
            reason: { type: 'string', maxLength: 500 },
          },
        },
        BulkStatusUpdateRequest: {
          type: 'object',
          required: ['claimIds', 'status'],
          properties: {
            claimIds: { 
              type: 'array', 
              items: { type: 'string', format: 'uuid' },
              minItems: 1,
              maxItems: 100,
            },
            status: { 
              type: 'string', 
              enum: ['submitted', 'under_review', 'approved', 'rejected', 'paid'] 
            },
            reason: { type: 'string' },
          },
        },

        // Patient Status schemas
        PatientStatusEvent: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            patientId: { type: 'string', format: 'uuid' },
            organizationId: { type: 'string', format: 'uuid' },
            statusType: { type: 'string', enum: ['admission', 'discharge', 'treatment'] },
            occurredAt: { type: 'string', format: 'date-time' },
            details: { type: 'object' },
            jobId: { type: 'string', format: 'uuid' },
            jobStatus: { type: 'string', enum: ['pending', 'processing', 'completed', 'failed'] },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        CreatePatientStatusRequest: {
          type: 'object',
          required: ['patientId', 'statusType', 'occurredAt'],
          properties: {
            patientId: { type: 'string', format: 'uuid' },
            statusType: { type: 'string', enum: ['admission', 'discharge', 'treatment'] },
            occurredAt: { type: 'string', format: 'date-time' },
            details: {
              type: 'object',
              properties: {
                facilityId: { type: 'string' },
                facilityName: { type: 'string' },
                admittingDiagnosis: { type: 'string' },
                dischargeDiagnosis: { type: 'string' },
                treatmentType: { type: 'string' },
                treatmentDescription: { type: 'string' },
                notes: { type: 'string' },
              },
            },
            idempotencyKey: { type: 'string', description: 'Optional client-provided idempotency key' },
          },
        },

        // Pagination
        PaginatedClaims: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                items: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Claim' },
                },
                total: { type: 'integer', example: 100 },
                limit: { type: 'integer', example: 20 },
                offset: { type: 'integer', example: 0 },
                hasMore: { type: 'boolean', example: true },
              },
            },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: ['./src/presentation/routes/*.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);