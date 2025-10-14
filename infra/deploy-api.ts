/**
 * Deployment API endpoints
 * Provides Docker deployment management with RBAC
 */

import { api, Header } from 'encore.dev/api';
import { verifyClerkJWT } from '../shared/clerk-auth.js';
import { ensureProjectPermission } from '../projects/permissions.js';
import { dockerManager } from './docker-manager.js';

interface CreateDeploymentRequest {
  authorization: Header<'Authorization'>;
  projectId: string;
  environment?: Record<string, string>;
}

interface GetDeploymentRequest {
  authorization: Header<'Authorization'>;
  deploymentId: string;
}

interface GetProjectDeploymentRequest {
  authorization: Header<'Authorization'>;
  projectId: string;
}

interface ListDeploymentsRequest {
  authorization: Header<'Authorization'>;
  projectId: string;
  limit?: number;
}

interface StopDeploymentRequest {
  authorization: Header<'Authorization'>;
  deploymentId: string;
}

interface DeleteDeploymentRequest {
  authorization: Header<'Authorization'>;
  deploymentId: string;
}

interface CheckHealthRequest {
  authorization: Header<'Authorization'>;
  deploymentId: string;
}

interface GetContainerLogsRequest {
  authorization: Header<'Authorization'>;
  deploymentId: string;
  tail?: number;
}

interface GetLogsRequest {
  authorization: Header<'Authorization'>;
  deploymentId: string;
  limit?: number;
}

/**
 * Create a deployment for a project
 */
export const createDeployment = api(
  { method: 'POST', path: '/deploy/create' },
  async (req: CreateDeploymentRequest): Promise<{ deployment: any }> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const projectId = BigInt(req.projectId);

    await ensureProjectPermission(userId, projectId, 'deploy');

    const deployment = await dockerManager.createDeployment(projectId, req.environment);

    return { deployment };
  }
);

/**
 * Get deployment by ID
 */
export const getDeployment = api(
  { method: 'GET', path: '/deploy/:deploymentId' },
  async (req: GetDeploymentRequest): Promise<{ deployment: any }> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const deploymentId = BigInt(req.deploymentId);

    const deployment = await dockerManager.getDeployment(deploymentId);
    await ensureProjectPermission(userId, deployment.project_id, 'view');

    return { deployment };
  }
);

/**
 * Get active deployment for a project
 */
export const getProjectDeployment = api(
  { method: 'GET', path: '/deploy/project/:projectId' },
  async (req: GetProjectDeploymentRequest): Promise<{ deployment: any | null }> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const projectId = BigInt(req.projectId);

    await ensureProjectPermission(userId, projectId, 'view');

    const deployment = await dockerManager.getProjectDeployment(projectId);

    return { deployment };
  }
);

/**
 * List all deployments for a project
 */
export const listDeployments = api(
  { method: 'GET', path: '/deploy/list/:projectId' },
  async (req: ListDeploymentsRequest): Promise<{ deployments: any[] }> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const projectId = BigInt(req.projectId);

    await ensureProjectPermission(userId, projectId, 'view');

    const deployments = await dockerManager.listDeployments(projectId, req.limit || 20);

    return { deployments };
  }
);

/**
 * Stop a deployment
 */
export const stopDeployment = api(
  { method: 'POST', path: '/deploy/:deploymentId/stop' },
  async (req: StopDeploymentRequest): Promise<{ success: boolean }> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const deploymentId = BigInt(req.deploymentId);

    const deployment = await dockerManager.getDeployment(deploymentId);
    await ensureProjectPermission(userId, deployment.project_id, 'deploy');

    await dockerManager.stopDeployment(deploymentId);

    return { success: true };
  }
);

/**
 * Delete a deployment
 */
export const deleteDeployment = api(
  { method: 'DELETE', path: '/deploy/:deploymentId' },
  async (req: DeleteDeploymentRequest): Promise<{ success: boolean }> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const deploymentId = BigInt(req.deploymentId);

    const deployment = await dockerManager.getDeployment(deploymentId);
    await ensureProjectPermission(userId, deployment.project_id, 'delete');

    await dockerManager.deleteDeployment(deploymentId);

    return { success: true };
  }
);

/**
 * Check deployment health
 */
export const checkHealth = api(
  { method: 'GET', path: '/deploy/:deploymentId/health' },
  async (req: CheckHealthRequest): Promise<{ health: string }> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const deploymentId = BigInt(req.deploymentId);

    const deployment = await dockerManager.getDeployment(deploymentId);
    await ensureProjectPermission(userId, deployment.project_id, 'view');

    const health = await dockerManager.checkHealth(deploymentId);

    return { health };
  }
);

/**
 * Get container logs
 */
export const getContainerLogs = api(
  { method: 'GET', path: '/deploy/:deploymentId/container-logs' },
  async (req: GetContainerLogsRequest): Promise<{ logs: string }> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const deploymentId = BigInt(req.deploymentId);

    const deployment = await dockerManager.getDeployment(deploymentId);
    await ensureProjectPermission(userId, deployment.project_id, 'view');

    const logs = await dockerManager.getContainerLogs(deploymentId, req.tail || 100);

    return { logs };
  }
);

/**
 * Get deployment operation logs
 */
export const getLogs = api(
  { method: 'GET', path: '/deploy/:deploymentId/logs' },
  async (req: GetLogsRequest): Promise<{ logs: any[] }> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const deploymentId = BigInt(req.deploymentId);

    const deployment = await dockerManager.getDeployment(deploymentId);
    await ensureProjectPermission(userId, deployment.project_id, 'view');

    const logs = await dockerManager.getLogs(deploymentId, req.limit || 100);

    return { logs };
  }
);
