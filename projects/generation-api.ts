/**
 * Project Generation API
 * Endpoints for managing project generation workflows
 */

import { api, Header } from 'encore.dev/api';
import { verifyClerkJWT } from '../shared/clerk-auth.js';
import { ensureProjectPermission } from './permissions.js';
import { startProjectGeneration, getGenerationJob, getGenerationLogs } from '../ai/project-generator.js';
import type { WizardData } from '../shared/types.js';
import { ValidationError, toAPIError } from '../shared/errors.js';

interface GenerateProjectRequest {
  authorization: Header<'Authorization'>;
  projectId: string;
  wizardData: WizardData;
}

interface GetGenerationStatusRequest {
  authorization: Header<'Authorization'>;
  projectId: string;
}

interface GetGenerationLogsRequest {
  authorization: Header<'Authorization'>;
  projectId: string;
  limit?: number;
}

/**
 * Start project generation
 */
export const generateProject = api(
  { method: 'POST', path: '/projects/:projectId/generate' },
  async (req: GenerateProjectRequest): Promise<{ jobId: string; status: string }> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const projectId = BigInt(req.projectId);

    await ensureProjectPermission(userId, projectId, 'edit');

    if (!req.wizardData) {
      throw toAPIError(new ValidationError('wizardData is required'));
    }

    // Validate wizard data
    if (!req.wizardData.vision?.name || !req.wizardData.vision?.description) {
      throw toAPIError(new ValidationError('Project name and description are required'));
    }

    console.log(`[API] Starting project generation for project ${projectId}`);

    // Start generation (async)
    const { jobId } = await startProjectGeneration(projectId, req.wizardData, userId);

    return {
      jobId: jobId.toString(),
      status: 'started'
    };
  }
);

/**
 * Get project generation status
 */
export const getGenerationStatus = api(
  { method: 'GET', path: '/projects/:projectId/generation/status' },
  async (req: GetGenerationStatusRequest): Promise<{
    job: any | null;
    status: string;
    progress: number;
    currentStep: string | null;
  }> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const projectId = BigInt(req.projectId);

    await ensureProjectPermission(userId, projectId, 'view');

    // Get the latest generation job for this project
    const { db } = await import('./db.js');
    const job = await db.queryRow<any>`
      SELECT * FROM generation_jobs
      WHERE project_id = ${projectId}
      ORDER BY created_at DESC
      LIMIT 1
    `;

    if (!job) {
      return {
        job: null,
        status: 'not_started',
        progress: 0,
        currentStep: null
      };
    }

    return {
      job: {
        id: job.id.toString(),
        projectId: job.project_id.toString(),
        status: job.status,
        progress: job.progress,
        currentStep: job.current_step,
        errorMessage: job.error_message,
        startedAt: job.started_at,
        completedAt: job.completed_at
      },
      status: job.status,
      progress: job.progress,
      currentStep: job.current_step
    };
  }
);

/**
 * Get generation logs
 */
export const getProjectGenerationLogs = api(
  { method: 'GET', path: '/projects/:projectId/generation/logs' },
  async (req: GetGenerationLogsRequest): Promise<{ logs: any[] }> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const projectId = BigInt(req.projectId);

    await ensureProjectPermission(userId, projectId, 'view');

    // Get the latest job ID
    const { db } = await import('./db.js');
    const job = await db.queryRow<any>`
      SELECT id FROM generation_jobs
      WHERE project_id = ${projectId}
      ORDER BY created_at DESC
      LIMIT 1
    `;

    if (!job) {
      return { logs: [] };
    }

    const logs = await getGenerationLogs(job.id, req.limit || 100);

    return {
      logs: logs.map(log => ({
        id: log.id.toString(),
        level: log.level,
        message: log.message,
        toolName: log.tool_name,
        filePath: log.file_path,
        metadata: log.metadata,
        createdAt: log.created_at
      }))
    };
  }
);
