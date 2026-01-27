import type { Request, Response } from 'express';
import { checkDatabaseConnection } from '../../infrastructure/database/connection.js';
import { checkQueueHealth, getQueueStats } from '../../infrastructure/queue/queue.js';
import type { ApiResponse } from '../../shared/types/index.js';

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  services: {
    database: { status: 'up' | 'down'; latencyMs?: number };
    queue: { status: 'up' | 'down'; stats?: object };
  };
}

/**
 * Basic health check
 * GET /health
 */
export async function healthCheck(
  _req: Request,
  res: Response<ApiResponse<{ status: string }>>
): Promise<void> {
  res.status(200).json({
    success: true,
    data: { status: 'ok' },
    meta: {
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * Detailed health check with service status
 * GET /health/detailed
 */
export async function detailedHealthCheck(
  _req: Request,
  res: Response<ApiResponse<HealthStatus>>
): Promise<void> {
  // Check database
  let dbStatus: 'up' | 'down' = 'down';
  let dbLatency: number | undefined;
  
  try {
    const dbStart = Date.now();
    const isConnected = await checkDatabaseConnection();
    dbLatency = Date.now() - dbStart;
    dbStatus = isConnected ? 'up' : 'down';
  } catch {
    dbStatus = 'down';
  }

  // Check queue
  let queueStatus: 'up' | 'down' = 'down';
  let queueStats: object | undefined;

  try {
    const queueHealthy = await checkQueueHealth();
    if (queueHealthy) {
      queueStatus = 'up';
      queueStats = await getQueueStats();
    }
  } catch {
    queueStatus = 'down';
  }

  // Determine overall status
  let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
  if (dbStatus === 'down') {
    overallStatus = 'unhealthy';
  } else if (queueStatus === 'down') {
    overallStatus = 'degraded';
  }

  const healthStatus: HealthStatus = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    services: {
      database: { status: dbStatus, latencyMs: dbLatency },
      queue: { status: queueStatus, stats: queueStats },
    },
  };

  const httpStatus = overallStatus === 'unhealthy' ? 503 : 200;

  res.status(httpStatus).json({
    success: overallStatus !== 'unhealthy',
    data: healthStatus,
    meta: {
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * Readiness probe for Kubernetes
 * GET /ready
 */
export async function readinessCheck(
  _req: Request,
  res: Response
): Promise<void> {
  try {
    const isConnected = await checkDatabaseConnection();
    if (isConnected) {
      res.status(200).send('ready');
    } else {
      res.status(503).send('not ready');
    }
  } catch {
    res.status(503).send('not ready');
  }
}

/**
 * Liveness probe for Kubernetes
 * GET /live
 */
export function livenessCheck(
  _req: Request,
  res: Response
): void {
  res.status(200).send('live');
}
