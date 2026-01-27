import type { Request, Response } from 'express';
import { patientStatusService } from '../../application/services/patient-status.service.js';
import type { ApiResponse, PaginatedResult } from '../../shared/types/index.js';
import type { PatientStatusEvent } from '../../domain/entities/index.js';
import type { CreatePatientStatusInput } from '../../application/validators/index.js';

/**
 * Create a patient status change event
 * POST /api/patient-status
 */
export async function createStatusEvent(
  req: Request<unknown, unknown, CreatePatientStatusInput>,
  res: Response<ApiResponse<PatientStatusEvent>>
): Promise<void> {
  const event = await patientStatusService.createStatusEvent(
    req.body,
    req.tenantContext!
  );

  res.status(201).json({
    success: true,
    data: event,
    meta: {
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * Get patient status history
 * GET /api/patient-status/history/:patientId
 */
export async function getPatientHistory(
  req: Request<{ patientId: string }, unknown, unknown, { limit?: string; offset?: string }>,
  res: Response<ApiResponse<PaginatedResult<PatientStatusEvent>>>
): Promise<void> {
  const pagination = {
    limit: parseInt(req.query.limit || '20', 10),
    offset: parseInt(req.query.offset || '0', 10),
  };

  const result = await patientStatusService.getPatientHistory(
    req.params.patientId,
    req.tenantContext!,
    pagination
  );

  res.status(200).json({
    success: true,
    data: result,
    meta: {
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * Get a single status event
 * GET /api/patient-status/:id
 */
export async function getStatusEvent(
  req: Request<{ id: string }>,
  res: Response<ApiResponse<PatientStatusEvent>>
): Promise<void> {
  const event = await patientStatusService.getStatusEvent(
    req.params.id,
    req.tenantContext!
  );

  res.status(200).json({
    success: true,
    data: event,
    meta: {
      timestamp: new Date().toISOString(),
    },
  });
}
