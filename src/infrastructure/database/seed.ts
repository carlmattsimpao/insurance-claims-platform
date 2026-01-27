import bcrypt from 'bcryptjs';
import { db } from './connection.js';
import {
  organizations,
  users,
  providers,
  patients,
  claims,
} from './schema/index.js';
import { logger } from '../../shared/utils/logger.js';
import type { ClaimStatus, UserRole } from '../../shared/types/index.js';

// Generate deterministic UUIDs for testing
function generateId(base: string, index: number): string {
  // Create a consistent ID for testing
  return `${base.padStart(32, '0').slice(0, 32)}${index.toString().padStart(4, '0').slice(-4)}`.replace(
    /(.{8})(.{4})(.{4})(.{4})(.{12})/,
    '$1-$2-$3-$4-$5'
  );
}

// Test data IDs
const ORG1_ID = generateId('org1', 1);
const ORG2_ID = generateId('org2', 2);

// Organization 1 users
const ADMIN1_ID = generateId('admin1', 1);
const PROCESSOR1_ID = generateId('processor1', 1);
const PROCESSOR2_ID = generateId('processor1', 2);
const PROVIDER1_ID = generateId('provider1', 1);
const PATIENT1_USER_ID = generateId('patient1user', 1);

// Organization 2 users
const ADMIN2_ID = generateId('admin2', 1);
const PROCESSOR3_ID = generateId('processor2', 1);
const PROVIDER2_ID = generateId('provider2', 1);
const PATIENT2_USER_ID = generateId('patient2user', 1);

// Providers
const PROVIDER1_ENTITY_ID = generateId('providerentity', 1);
const PROVIDER2_ENTITY_ID = generateId('providerentity', 2);

// Patients
const PATIENT1_ID = generateId('patiententity', 1);
const PATIENT2_ID = generateId('patiententity', 2);
const PATIENT3_ID = generateId('patiententity', 3);
const PATIENT4_ID = generateId('patiententity', 4);

// Claims
const CLAIM_IDS = Array.from({ length: 10 }, (_, i) => generateId('claim', i + 1));

async function seed(): Promise<void> {
  logger.info('Starting database seed...');

  const passwordHash = await bcrypt.hash('Password123!', 12);

  try {
    // Clean existing data (in reverse order of dependencies)
    await db.delete(claims);
    await db.delete(patients);
    await db.delete(providers);
    await db.delete(users);
    await db.delete(organizations);

    logger.info('Cleared existing data');

    // Create organizations
    await db.insert(organizations).values([
      {
        id: ORG1_ID,
        name: 'HealthFirst Insurance Co.',
        code: 'HEALTH1',
        isActive: true,
        settings: {
          maxClaimAmount: 500000,
          minClaimAmount: 0.01,
          autoApproveThreshold: 1000,
          requiresManualReview: true,
        },
      },
      {
        id: ORG2_ID,
        name: 'SecureCare Insurance',
        code: 'SECURE2',
        isActive: true,
        settings: {
          maxClaimAmount: 1000000,
          minClaimAmount: 0.01,
          autoApproveThreshold: 5000,
          requiresManualReview: false,
        },
      },
    ]);

    logger.info('Created organizations');

    // Create providers
    await db.insert(providers).values([
      {
        id: PROVIDER1_ENTITY_ID,
        organizationId: ORG1_ID,
        name: 'City General Hospital',
        npi: '1234567890',
        specialty: 'General Medicine',
        isActive: true,
        contactEmail: 'admin@citygeneral.com',
        contactPhone: '555-123-4567',
      },
      {
        id: PROVIDER2_ENTITY_ID,
        organizationId: ORG2_ID,
        name: 'Metro Medical Center',
        npi: '0987654321',
        specialty: 'Emergency Medicine',
        isActive: true,
        contactEmail: 'contact@metromedical.com',
        contactPhone: '555-987-6543',
      },
    ]);

    logger.info('Created providers');

    // Create patients
    await db.insert(patients).values([
      {
        id: PATIENT1_ID,
        organizationId: ORG1_ID,
        firstName: 'John',
        lastName: 'Smith',
        dateOfBirth: new Date('1985-03-15'),
        memberId: 'MEM-001-HF',
        isActive: true,
        contactEmail: 'john.smith@email.com',
      },
      {
        id: PATIENT2_ID,
        organizationId: ORG1_ID,
        firstName: 'Sarah',
        lastName: 'Johnson',
        dateOfBirth: new Date('1990-07-22'),
        memberId: 'MEM-002-HF',
        isActive: true,
        contactEmail: 'sarah.johnson@email.com',
      },
      {
        id: PATIENT3_ID,
        organizationId: ORG2_ID,
        firstName: 'Michael',
        lastName: 'Brown',
        dateOfBirth: new Date('1975-11-08'),
        memberId: 'MEM-001-SC',
        isActive: true,
        contactEmail: 'michael.brown@email.com',
      },
      {
        id: PATIENT4_ID,
        organizationId: ORG2_ID,
        firstName: 'Emily',
        lastName: 'Davis',
        dateOfBirth: new Date('1988-01-30'),
        memberId: 'MEM-002-SC',
        isActive: true,
        contactEmail: 'emily.davis@email.com',
      },
    ]);

    logger.info('Created patients');

    // Create users
    await db.insert(users).values([
      // Organization 1 users
      {
        id: ADMIN1_ID,
        organizationId: ORG1_ID,
        email: 'admin@healthfirst.com',
        passwordHash,
        firstName: 'Admin',
        lastName: 'User',
        role: 'admin' as UserRole,
        isActive: true,
        assignedClaimIds: [],
      },
      {
        id: PROCESSOR1_ID,
        organizationId: ORG1_ID,
        email: 'processor1@healthfirst.com',
        passwordHash,
        firstName: 'Alice',
        lastName: 'Processor',
        role: 'claims_processor' as UserRole,
        isActive: true,
        assignedClaimIds: [CLAIM_IDS[0], CLAIM_IDS[1], CLAIM_IDS[2]],
      },
      {
        id: PROCESSOR2_ID,
        organizationId: ORG1_ID,
        email: 'processor2@healthfirst.com',
        passwordHash,
        firstName: 'Bob',
        lastName: 'Handler',
        role: 'claims_processor' as UserRole,
        isActive: true,
        assignedClaimIds: [CLAIM_IDS[3], CLAIM_IDS[4]],
      },
      {
        id: PROVIDER1_ID,
        organizationId: ORG1_ID,
        email: 'doctor@citygeneral.com',
        passwordHash,
        firstName: 'Dr. James',
        lastName: 'Wilson',
        role: 'provider' as UserRole,
        isActive: true,
        providerId: PROVIDER1_ENTITY_ID,
        assignedClaimIds: [],
      },
      {
        id: PATIENT1_USER_ID,
        organizationId: ORG1_ID,
        email: 'john.smith@email.com',
        passwordHash,
        firstName: 'John',
        lastName: 'Smith',
        role: 'patient' as UserRole,
        isActive: true,
        patientId: PATIENT1_ID,
        assignedClaimIds: [],
      },
      // Organization 2 users
      {
        id: ADMIN2_ID,
        organizationId: ORG2_ID,
        email: 'admin@securecare.com',
        passwordHash,
        firstName: 'Admin',
        lastName: 'SecureCare',
        role: 'admin' as UserRole,
        isActive: true,
        assignedClaimIds: [],
      },
      {
        id: PROCESSOR3_ID,
        organizationId: ORG2_ID,
        email: 'processor@securecare.com',
        passwordHash,
        firstName: 'Charlie',
        lastName: 'Claims',
        role: 'claims_processor' as UserRole,
        isActive: true,
        assignedClaimIds: [CLAIM_IDS[5], CLAIM_IDS[6]],
      },
      {
        id: PROVIDER2_ID,
        organizationId: ORG2_ID,
        email: 'doctor@metromedical.com',
        passwordHash,
        firstName: 'Dr. Lisa',
        lastName: 'Chen',
        role: 'provider' as UserRole,
        isActive: true,
        providerId: PROVIDER2_ENTITY_ID,
        assignedClaimIds: [],
      },
      {
        id: PATIENT2_USER_ID,
        organizationId: ORG2_ID,
        email: 'michael.brown@email.com',
        passwordHash,
        firstName: 'Michael',
        lastName: 'Brown',
        role: 'patient' as UserRole,
        isActive: true,
        patientId: PATIENT3_ID,
        assignedClaimIds: [],
      },
    ]);

    logger.info('Created users');

    // Create claims
    const claimData = [
      // Organization 1 claims
      {
        id: CLAIM_IDS[0],
        organizationId: ORG1_ID,
        claimNumber: 'CLM-HF-001',
        patientId: PATIENT1_ID,
        providerId: PROVIDER1_ENTITY_ID,
        diagnosisCode: 'J06.9',
        amount: '250.00',
        status: 'submitted' as ClaimStatus,
        serviceDate: new Date('2025-01-15'),
        submittedAt: new Date('2025-01-16'),
        assignedTo: PROCESSOR1_ID,
        statusHistory: [{ fromStatus: null, toStatus: 'submitted', changedBy: PROVIDER1_ID, changedAt: new Date('2025-01-16'), reason: 'Initial submission' }],
      },
      {
        id: CLAIM_IDS[1],
        organizationId: ORG1_ID,
        claimNumber: 'CLM-HF-002',
        patientId: PATIENT1_ID,
        providerId: PROVIDER1_ENTITY_ID,
        diagnosisCode: 'M54.5',
        amount: '1500.00',
        status: 'under_review' as ClaimStatus,
        serviceDate: new Date('2025-01-10'),
        submittedAt: new Date('2025-01-12'),
        assignedTo: PROCESSOR1_ID,
        statusHistory: [
          { fromStatus: null, toStatus: 'submitted', changedBy: PROVIDER1_ID, changedAt: new Date('2025-01-12'), reason: 'Initial submission' },
          { fromStatus: 'submitted', toStatus: 'under_review', changedBy: PROCESSOR1_ID, changedAt: new Date('2025-01-14'), reason: 'Under review' },
        ],
      },
      {
        id: CLAIM_IDS[2],
        organizationId: ORG1_ID,
        claimNumber: 'CLM-HF-003',
        patientId: PATIENT2_ID,
        providerId: PROVIDER1_ENTITY_ID,
        diagnosisCode: 'I10',
        amount: '450.00',
        status: 'approved' as ClaimStatus,
        serviceDate: new Date('2025-01-05'),
        submittedAt: new Date('2025-01-06'),
        processedAt: new Date('2025-01-08'),
        assignedTo: PROCESSOR1_ID,
        statusHistory: [
          { fromStatus: null, toStatus: 'submitted', changedBy: PROVIDER1_ID, changedAt: new Date('2025-01-06'), reason: 'Initial submission' },
          { fromStatus: 'submitted', toStatus: 'approved', changedBy: PROCESSOR1_ID, changedAt: new Date('2025-01-08'), reason: 'Approved after review' },
        ],
      },
      {
        id: CLAIM_IDS[3],
        organizationId: ORG1_ID,
        claimNumber: 'CLM-HF-004',
        patientId: PATIENT1_ID,
        providerId: PROVIDER1_ENTITY_ID,
        diagnosisCode: 'E11.9',
        amount: '3200.00',
        status: 'rejected' as ClaimStatus,
        serviceDate: new Date('2024-12-20'),
        submittedAt: new Date('2024-12-22'),
        processedAt: new Date('2024-12-28'),
        assignedTo: PROCESSOR2_ID,
        denialReason: 'Service not covered under current plan',
        statusHistory: [
          { fromStatus: null, toStatus: 'submitted', changedBy: PROVIDER1_ID, changedAt: new Date('2024-12-22'), reason: 'Initial submission' },
          { fromStatus: 'submitted', toStatus: 'rejected', changedBy: PROCESSOR2_ID, changedAt: new Date('2024-12-28'), reason: 'Service not covered' },
        ],
      },
      {
        id: CLAIM_IDS[4],
        organizationId: ORG1_ID,
        claimNumber: 'CLM-HF-005',
        patientId: PATIENT2_ID,
        providerId: PROVIDER1_ENTITY_ID,
        diagnosisCode: 'F32.9',
        amount: '175.00',
        status: 'paid' as ClaimStatus,
        serviceDate: new Date('2024-12-01'),
        submittedAt: new Date('2024-12-03'),
        processedAt: new Date('2024-12-05'),
        paidAt: new Date('2024-12-15'),
        assignedTo: PROCESSOR2_ID,
        statusHistory: [
          { fromStatus: null, toStatus: 'submitted', changedBy: PROVIDER1_ID, changedAt: new Date('2024-12-03'), reason: 'Initial submission' },
          { fromStatus: 'submitted', toStatus: 'approved', changedBy: PROCESSOR2_ID, changedAt: new Date('2024-12-05'), reason: 'Approved' },
          { fromStatus: 'approved', toStatus: 'paid', changedBy: ADMIN1_ID, changedAt: new Date('2024-12-15'), reason: 'Payment processed' },
        ],
      },
      // Organization 2 claims
      {
        id: CLAIM_IDS[5],
        organizationId: ORG2_ID,
        claimNumber: 'CLM-SC-001',
        patientId: PATIENT3_ID,
        providerId: PROVIDER2_ENTITY_ID,
        diagnosisCode: 'J45.909',
        amount: '890.00',
        status: 'submitted' as ClaimStatus,
        serviceDate: new Date('2025-01-18'),
        submittedAt: new Date('2025-01-19'),
        assignedTo: PROCESSOR3_ID,
        statusHistory: [{ fromStatus: null, toStatus: 'submitted', changedBy: PROVIDER2_ID, changedAt: new Date('2025-01-19'), reason: 'Initial submission' }],
      },
      {
        id: CLAIM_IDS[6],
        organizationId: ORG2_ID,
        claimNumber: 'CLM-SC-002',
        patientId: PATIENT4_ID,
        providerId: PROVIDER2_ENTITY_ID,
        diagnosisCode: 'N39.0',
        amount: '320.00',
        status: 'under_review' as ClaimStatus,
        serviceDate: new Date('2025-01-12'),
        submittedAt: new Date('2025-01-13'),
        assignedTo: PROCESSOR3_ID,
        statusHistory: [
          { fromStatus: null, toStatus: 'submitted', changedBy: PROVIDER2_ID, changedAt: new Date('2025-01-13'), reason: 'Initial submission' },
          { fromStatus: 'submitted', toStatus: 'under_review', changedBy: PROCESSOR3_ID, changedAt: new Date('2025-01-15'), reason: 'Under review' },
        ],
      },
      {
        id: CLAIM_IDS[7],
        organizationId: ORG2_ID,
        claimNumber: 'CLM-SC-003',
        patientId: PATIENT3_ID,
        providerId: PROVIDER2_ENTITY_ID,
        diagnosisCode: 'R51',
        amount: '150.00',
        status: 'approved' as ClaimStatus,
        serviceDate: new Date('2025-01-01'),
        submittedAt: new Date('2025-01-02'),
        processedAt: new Date('2025-01-04'),
        statusHistory: [
          { fromStatus: null, toStatus: 'submitted', changedBy: PROVIDER2_ID, changedAt: new Date('2025-01-02'), reason: 'Initial submission' },
          { fromStatus: 'submitted', toStatus: 'approved', changedBy: ADMIN2_ID, changedAt: new Date('2025-01-04'), reason: 'Auto-approved under threshold' },
        ],
      },
    ];

    await db.insert(claims).values(claimData);

    logger.info('Created claims');

    logger.info('✅ Database seed completed successfully');
    logger.info('\n📋 Test Credentials:');
    logger.info('================================');
    logger.info('Organization 1 (HealthFirst):');
    logger.info('  Admin: admin@healthfirst.com / Password123!');
    logger.info('  Processor 1: processor1@healthfirst.com / Password123!');
    logger.info('  Processor 2: processor2@healthfirst.com / Password123!');
    logger.info('  Provider: doctor@citygeneral.com / Password123!');
    logger.info('  Patient: john.smith@email.com / Password123!');
    logger.info('');
    logger.info('Organization 2 (SecureCare):');
    logger.info('  Admin: admin@securecare.com / Password123!');
    logger.info('  Processor: processor@securecare.com / Password123!');
    logger.info('  Provider: doctor@metromedical.com / Password123!');
    logger.info('  Patient: michael.brown@email.com / Password123!');
    logger.info('================================');
  } catch (error) {
    logger.error('❌ Seed failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  }

  process.exit(0);
}

seed();
