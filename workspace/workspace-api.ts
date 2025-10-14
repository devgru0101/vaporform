/**
 * Workspace API endpoints
 * Provides Daytona workspace management with RBAC
 */

import { api, Header } from 'encore.dev/api';
import { verifyClerkJWT } from '../shared/clerk-auth.js';
import { ensureProjectPermission } from '../projects/permissions.js';
import { daytonaManager } from './daytona-manager.js';
import { ValidationError, toAPIError } from '../shared/errors.js';
import { db as projectDB } from '../projects/db.js';

interface CreateWorkspaceRequest {
  authorization: Header<'Authorization'>;
  projectId: string;
  name: string;
  language?: string;
  image?: string;
  resources?: { cpu: number; memory: number; disk: number };
  environment?: Record<string, string>;
  autoStopInterval?: number;
  autoArchiveInterval?: number;
  ephemeral?: boolean;
}

interface GetWorkspaceRequest {
  authorization: Header<'Authorization'>;
  workspaceId: string;
}

interface GetProjectWorkspaceRequest {
  authorization: Header<'Authorization'>;
  projectId: string;
}

interface StopWorkspaceRequest {
  authorization: Header<'Authorization'>;
  workspaceId: string;
}

interface DeleteWorkspaceRequest {
  authorization: Header<'Authorization'>;
  workspaceId: string;
}

interface ForceRebuildWorkspaceRequest {
  authorization: Header<'Authorization'>;
  projectId: string;
}

interface ExecuteCommandRequest {
  authorization: Header<'Authorization'>;
  workspaceId: string;
  command: string;
}

interface WriteFileRequest {
  authorization: Header<'Authorization'>;
  workspaceId: string;
  path: string;
  content: string;
}

interface ReadFileRequest {
  authorization: Header<'Authorization'>;
  workspaceId: string;
  path: string;
}

interface GetSandboxUrlRequest {
  authorization: Header<'Authorization'>;
  workspaceId: string;
}

interface ExecuteCommandResponse {
  stdout: string;
  stderr: string;
  exitCode: number;
}

interface BuildProjectRequest {
  authorization: Header<'Authorization'>;
  projectId: string;
  workspaceId?: string;
}

interface GetBuildRequest {
  authorization: Header<'Authorization'>;
  buildId: string;
}

interface ListBuildsRequest {
  authorization: Header<'Authorization'>;
  projectId: string;
  limit?: number;
}

interface GetLogsRequest {
  authorization: Header<'Authorization'>;
  workspaceId: string;
  limit?: number;
}

/**
 * Create a workspace for a project
 */
export const createWorkspace = api(
  { method: 'POST', path: '/workspace/create' },
  async (req: CreateWorkspaceRequest): Promise<{ workspace: any }> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const projectId = BigInt(req.projectId);

    await ensureProjectPermission(userId, projectId, 'edit');

    if (!req.name || req.name.trim().length === 0) {
      throw toAPIError(new ValidationError('Workspace name is required'));
    }

    const workspace = await daytonaManager.createWorkspace(
      projectId,
      req.name,
      {
        language: req.language,
        image: req.image,
        resources: req.resources,
        environment: req.environment,
        autoStopInterval: req.autoStopInterval,
        autoArchiveInterval: req.autoArchiveInterval,
        ephemeral: req.ephemeral,
      }
    );

    return { workspace };
  }
);

/**
 * Get workspace by ID
 */
export const getWorkspace = api(
  { method: 'GET', path: '/workspace/:workspaceId' },
  async (req: GetWorkspaceRequest): Promise<{ workspace: any }> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const workspaceId = BigInt(req.workspaceId);

    const workspace = await daytonaManager.getWorkspace(workspaceId);
    await ensureProjectPermission(userId, workspace.project_id, 'view');

    return { workspace };
  }
);

/**
 * Get workspace for a project (with smart workspace management)
 */
export const getProjectWorkspace = api(
  { method: 'GET', path: '/workspace/project/:projectId' },
  async (req: GetProjectWorkspaceRequest): Promise<{ workspace: any | null }> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const projectId = BigInt(req.projectId);

    await ensureProjectPermission(userId, projectId, 'view');

    // Smart workspace management: create if missing, start if stopped
    let workspace = await daytonaManager.getProjectWorkspace(projectId);

    if (!workspace) {
      // No workspace exists - create one for this existing project
      console.log(`[Workspace Manager] No workspace found for project ${projectId}, creating one...`);

      // Get project details to determine workspace name and template
      const project = await projectDB.queryRow<{ id: bigint; name: string; template: string | null }>`
        SELECT id, name, template FROM projects WHERE id = ${projectId}
      `;

      if (!project) {
        throw new Error(`Project ${projectId} not found`);
      }

      const workspaceName = `${project.name} Workspace`;
      const template = project.template || 'typescript';

      console.log(`[Workspace Manager] Creating Daytona workspace for project ${projectId} (${project.name})`);

      workspace = await daytonaManager.createWorkspace(projectId, workspaceName, {
        language: template,
        environment: {
          PROJECT_ID: projectId.toString(),
          PROJECT_NAME: project.name,
        },
        autoStopInterval: 60, // Auto-stop after 1 hour
        autoArchiveInterval: 24 * 60, // Auto-archive after 24 hours
        ephemeral: false,
      });

      console.log(`[Workspace Manager] ✓ Created Daytona workspace for project ${projectId}`);
    } else if (workspace.status === 'stopped') {
      // Workspace exists but stopped - restart it
      console.log(`[Workspace Manager] Auto-starting stopped workspace for project ${projectId}`);
      await daytonaManager.restartWorkspace(workspace.id);
      console.log(`[Workspace Manager] ✓ Restarted workspace for project ${projectId}`);

      // Refresh workspace status
      workspace = await daytonaManager.getProjectWorkspace(projectId);
    } else if (workspace.status === 'error') {
      // Workspace in error state - try to recover
      console.log(`[Workspace Manager] Attempting to recover errored workspace for project ${projectId}`);
      await daytonaManager.restartWorkspace(workspace.id);
      console.log(`[Workspace Manager] ✓ Recovered workspace for project ${projectId}`);

      // Refresh workspace status
      workspace = await daytonaManager.getProjectWorkspace(projectId);
    } else if (workspace.status === 'running') {
      console.log(`[Workspace Manager] Workspace already running for project ${projectId}`);
    } else {
      console.log(`[Workspace Manager] Workspace status for project ${projectId}: ${workspace.status}`);
    }

    return { workspace };
  }
);

/**
 * Stop a workspace
 */
export const stopWorkspace = api(
  { method: 'POST', path: '/workspace/:workspaceId/stop' },
  async (req: StopWorkspaceRequest): Promise<{ success: boolean }> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const workspaceId = BigInt(req.workspaceId);

    const workspace = await daytonaManager.getWorkspace(workspaceId);
    await ensureProjectPermission(userId, workspace.project_id, 'edit');

    await daytonaManager.stopWorkspace(workspaceId);

    return { success: true };
  }
);

/**
 * Delete a workspace
 */
export const deleteWorkspace = api(
  { method: 'DELETE', path: '/workspace/:workspaceId' },
  async (req: DeleteWorkspaceRequest): Promise<{ success: boolean }> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const workspaceId = BigInt(req.workspaceId);

    const workspace = await daytonaManager.getWorkspace(workspaceId);
    await ensureProjectPermission(userId, workspace.project_id, 'delete');

    await daytonaManager.deleteWorkspace(workspaceId);

    return { success: true };
  }
);

/**
 * Force rebuild workspace - destroys old workspace and creates a new one
 */
export const forceRebuildWorkspace = api(
  { method: 'POST', path: '/workspace/rebuild/:projectId' },
  async (req: ForceRebuildWorkspaceRequest): Promise<{ workspace: any }> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const projectId = BigInt(req.projectId);

    await ensureProjectPermission(userId, projectId, 'edit');

    console.log(`[Force Rebuild] Starting force rebuild for project ${projectId}`);

    // Get existing workspace if it exists
    const existingWorkspace = await daytonaManager.getProjectWorkspace(projectId);

    if (existingWorkspace) {
      console.log(`[Force Rebuild] Deleting existing workspace ${existingWorkspace.id} for project ${projectId}`);
      try {
        await daytonaManager.deleteWorkspace(existingWorkspace.id);
        console.log(`[Force Rebuild] ✓ Deleted workspace ${existingWorkspace.id}`);
      } catch (error) {
        console.error(`[Force Rebuild] Error deleting workspace:`, error);
        // Continue even if delete fails - we'll create a new one anyway
      }
    } else {
      console.log(`[Force Rebuild] No existing workspace found for project ${projectId}`);
    }

    // Get project details for new workspace
    const project = await projectDB.queryRow<{ id: bigint; name: string; template: string | null }>`
      SELECT id, name, template FROM projects WHERE id = ${projectId}
    `;

    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    const workspaceName = `${project.name} Workspace`;
    const template = project.template || 'typescript';

    console.log(`[Force Rebuild] Creating new workspace for project ${projectId} (${project.name})`);

    // Create new workspace
    const newWorkspace = await daytonaManager.createWorkspace(projectId, workspaceName, {
      language: template,
      environment: {
        PROJECT_ID: projectId.toString(),
        PROJECT_NAME: project.name,
      },
      autoStopInterval: 60, // Auto-stop after 1 hour
      autoArchiveInterval: 24 * 60, // Auto-archive after 24 hours
      ephemeral: false,
    });

    console.log(`[Force Rebuild] ✓ Created new workspace ${newWorkspace.id} for project ${projectId}`);

    return { workspace: newWorkspace };
  }
);

/**
 * Execute command in workspace
 */
export const executeCommand = api(
  { method: 'POST', path: '/workspace/:workspaceId/exec' },
  async (req: ExecuteCommandRequest): Promise<ExecuteCommandResponse> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const workspaceId = BigInt(req.workspaceId);

    const workspace = await daytonaManager.getWorkspace(workspaceId);
    await ensureProjectPermission(userId, workspace.project_id, 'edit');

    if (!req.command || req.command.trim().length === 0) {
      throw toAPIError(new ValidationError('Command is required'));
    }

    const result = await daytonaManager.executeCommand(workspaceId, req.command);

    return result;
  }
);

/**
 * Build project
 */
export const buildProject = api(
  { method: 'POST', path: '/workspace/build' },
  async (req: BuildProjectRequest): Promise<{ build: any }> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const projectId = BigInt(req.projectId);

    await ensureProjectPermission(userId, projectId, 'deploy');

    const workspaceId = req.workspaceId ? BigInt(req.workspaceId) : undefined;

    const build = await daytonaManager.buildProject(projectId, workspaceId);

    return { build };
  }
);

/**
 * Get build by ID
 */
export const getBuild = api(
  { method: 'GET', path: '/workspace/build/:buildId' },
  async (req: GetBuildRequest): Promise<{ build: any }> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const buildId = BigInt(req.buildId);

    const build = await daytonaManager.getBuild(buildId);
    await ensureProjectPermission(userId, build.project_id, 'view');

    return { build };
  }
);

/**
 * List builds for a project
 */
export const listBuilds = api(
  { method: 'GET', path: '/workspace/builds/:projectId' },
  async (req: ListBuildsRequest): Promise<{ builds: any[] }> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const projectId = BigInt(req.projectId);

    await ensureProjectPermission(userId, projectId, 'view');

    const builds = await daytonaManager.listBuilds(projectId, req.limit || 20);

    return { builds };
  }
);

/**
 * Get workspace logs
 */
export const getLogs = api(
  { method: 'GET', path: '/workspace/:workspaceId/logs' },
  async (req: GetLogsRequest): Promise<{ logs: any[] }> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const workspaceId = BigInt(req.workspaceId);

    const workspace = await daytonaManager.getWorkspace(workspaceId);
    await ensureProjectPermission(userId, workspace.project_id, 'view');

    const logs = await daytonaManager.getLogs(workspaceId, req.limit || 100);

    return { logs };
  }
);

/**
 * Write file to workspace (using Daytona filesystem API)
 */
export const writeFile = api(
  { method: 'POST', path: '/workspace/:workspaceId/file' },
  async (req: WriteFileRequest): Promise<{ success: boolean }> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const workspaceId = BigInt(req.workspaceId);

    const workspace = await daytonaManager.getWorkspace(workspaceId);
    await ensureProjectPermission(userId, workspace.project_id, 'edit');

    if (!req.path || !req.content) {
      throw toAPIError(new ValidationError('Path and content are required'));
    }

    await daytonaManager.writeFile(workspaceId, req.path, req.content);

    return { success: true };
  }
);

/**
 * Read file from workspace (using Daytona filesystem API)
 */
export const readFile = api(
  { method: 'GET', path: '/workspace/:workspaceId/file' },
  async (req: ReadFileRequest): Promise<{ content: string }> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const workspaceId = BigInt(req.workspaceId);

    const workspace = await daytonaManager.getWorkspace(workspaceId);
    await ensureProjectPermission(userId, workspace.project_id, 'view');

    if (!req.path) {
      throw toAPIError(new ValidationError('Path is required'));
    }

    const content = await daytonaManager.readFile(workspaceId, req.path);

    return { content };
  }
);

/**
 * Get sandbox preview URL
 */
export const getSandboxUrl = api(
  { method: 'GET', path: '/workspace/:workspaceId/url' },
  async (req: GetSandboxUrlRequest): Promise<{ url: string | null }> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const workspaceId = BigInt(req.workspaceId);

    const workspace = await daytonaManager.getWorkspace(workspaceId);
    await ensureProjectPermission(userId, workspace.project_id, 'view');

    const url = await daytonaManager.getSandboxUrl(workspaceId);

    return { url };
  }
);
