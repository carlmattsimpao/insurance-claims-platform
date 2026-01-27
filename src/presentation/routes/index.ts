import { Router } from 'express';
import claimsRoutes from './claims.routes.js';
import patientStatusRoutes from './patient-status.routes.js';
import authRoutes from './auth.routes.js';
import healthRoutes from './health.routes.js';

const router = Router();

// API routes
router.use('/api/claims', claimsRoutes);
router.use('/api/patient-status', patientStatusRoutes);
router.use('/api/auth', authRoutes);

// Health check routes (no /api prefix)
router.use('/health', healthRoutes);
router.use('/', healthRoutes); // For /ready and /live

export default router;
