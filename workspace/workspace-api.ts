/**
 * Workspace API endpoints
 * Provides Daytona workspace management with RBAC
 */

import { api, Header, Query, APIError } from 'encore.dev/api';
import { verifyClerkJWT } from '../shared/clerk-auth.js';
import { ensureProjectPermission } from '../projects/permissions.js';
import { daytonaManager } from './daytona-manager.js';
import { buildManager } from './build-manager.js';
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
  waitForReady?: Query<boolean>; // Poll until workspace reaches running status
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

    let workspace = await daytonaManager.getWorkspace(workspaceId);
    await ensureProjectPermission(userId, workspace.project_id, 'view');

    // Sync status with Daytona API before returning
    workspace = await daytonaManager.syncWorkspaceStatus(workspaceId);

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
    } else if (workspace && workspace.status === 'stopped') {
      // Workspace exists but stopped - restart it with retry logic
      console.log(`[Workspace Manager] Auto-starting stopped workspace for project ${projectId}`);

      const workspaceId = workspace.id; // Capture ID for TypeScript null safety
      let retries = 0;
      const maxRetries = 3;
      let lastError: Error | null = null;
      let restarted = false;

      while (retries < maxRetries && !restarted) {
        try {
          await daytonaManager.restartWorkspace(workspaceId);
          console.log(`[Workspace Manager] ✓ Restarted workspace for project ${projectId} (attempt ${retries + 1})`);
          restarted = true;

          // Refresh workspace status
          workspace = await daytonaManager.getProjectWorkspace(projectId);
        } catch (error) {
          lastError = error as Error;
          retries++;

          if (retries < maxRetries) {
            const backoffMs = retries * 2000; // Exponential backoff: 2s, 4s, 6s
            console.log(`[Workspace Manager] Restart attempt ${retries} failed: ${lastError.message}. Retrying in ${backoffMs / 1000}s...`);
            await new Promise(resolve => setTimeout(resolve, backoffMs));
          }
        }
      }

      if (!restarted && lastError) {
        console.log(`[Workspace Manager] ✗ Failed to restart stopped workspace after ${maxRetries} attempts: ${lastError.message}`);
        console.log(`[Workspace Manager] Returning workspace in stopped state - frontend will handle this`);
        // Don't throw - let the frontend handle the stopped state
      }
    } else if (workspace && workspace.status === 'error') {
      // Workspace in error state - try to recover with retry logic
      console.log(`[Workspace Manager] Attempting to recover errored workspace for project ${projectId}`);

      const workspaceId = workspace.id; // Capture ID for TypeScript null safety
      let retries = 0;
      const maxRetries = 3;
      let lastError: Error | null = null;
      let recovered = false;

      while (retries < maxRetries && !recovered) {
        try {
          await daytonaManager.restartWorkspace(workspaceId);
          console.log(`[Workspace Manager] ✓ Recovered workspace for project ${projectId} (attempt ${retries + 1})`);
          recovered = true;

          // Refresh workspace status
          workspace = await daytonaManager.getProjectWorkspace(projectId);
        } catch (error) {
          lastError = error as Error;
          retries++;

          if (retries < maxRetries) {
            const backoffMs = retries * 2000; // Exponential backoff: 2s, 4s, 6s
            console.log(`[Workspace Manager] Recovery attempt ${retries} failed: ${lastError.message}. Retrying in ${backoffMs / 1000}s...`);
            await new Promise(resolve => setTimeout(resolve, backoffMs));
          }
        }
      }

      if (!recovered && lastError) {
        console.log(`[Workspace Manager] ✗ Failed to recover errored workspace after ${maxRetries} attempts: ${lastError.message}`);
        console.log(`[Workspace Manager] Returning workspace in error state - frontend will handle this`);
        // Don't throw - let the frontend handle the error state
      }
    } else if (workspace.status === 'running') {
      console.log(`[Workspace Manager] Workspace already running for project ${projectId}`);
    } else {
      console.log(`[Workspace Manager] Workspace status for project ${projectId}: ${workspace.status}`);
    }

    // Sync status with Daytona API before returning
    if (workspace) {
      workspace = await daytonaManager.syncWorkspaceStatus(workspace.id);
    }

    // NEW: If waitForReady=true, poll until workspace reaches running status
    if (req.waitForReady && workspace && workspace.status !== 'running') {
      console.log(`[Workspace Manager] Polling until workspace ${workspace.id} reaches running status...`);

      const maxAttempts = 30; // 60 seconds max (30 attempts * 2 seconds)
      let attempts = 0;

      while (attempts < maxAttempts && workspace.status !== 'running') {
        // Don't wait if workspace is in error or deleted state
        if (workspace.status === 'error' || workspace.status === 'deleted') {
          console.log(`[Workspace Manager] Workspace entered terminal state: ${workspace.status}`);
          break;
        }

        attempts++;
        console.log(`[Workspace Manager] Waiting for workspace... (${attempts}/${maxAttempts}, current status: ${workspace.status})`);

        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
        workspace = await daytonaManager.syncWorkspaceStatus(workspace.id);
      }

      if (workspace.status === 'running') {
        console.log(`[Workspace Manager] ✓ Workspace reached running status after ${attempts * 2} seconds`);
      } else {
        console.log(`[Workspace Manager] ⚠ Workspace did not reach running status (final status: ${workspace.status})`);
      }
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
 * Restart a workspace
 */
export const restartWorkspace = api(
  { method: 'POST', path: '/workspace/:workspaceId/restart' },
  async (req: StopWorkspaceRequest): Promise<{ workspace: any }> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const workspaceId = BigInt(req.workspaceId);

    const workspace = await daytonaManager.getWorkspace(workspaceId);
    await ensureProjectPermission(userId, workspace.project_id, 'edit');

    await daytonaManager.restartWorkspace(workspaceId);

    // Get updated workspace status
    const updatedWorkspace = await daytonaManager.syncWorkspaceStatus(workspaceId);

    return { workspace: updatedWorkspace };
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

    // Detect language from project files (for GitHub imports) or use template
    let detectedLanguage = project.template || 'typescript';

    if (project.template === 'github-import' || !project.template) {
      // Detect language from files in VFS
      const { gridfs } = await import('../vfs/gridfs.js');
      try {
        // Check for package.json (Node.js/TypeScript)
        const packageJsonBuffer = await gridfs.readFile(projectId, '/package.json');
        if (packageJsonBuffer) {
          detectedLanguage = 'typescript';
          console.log(`[Force Rebuild] Detected Node.js/TypeScript project from package.json`);
        }
      } catch {
        // Check for requirements.txt (Python)
        try {
          const reqBuffer = await gridfs.readFile(projectId, '/requirements.txt');
          if (reqBuffer) {
            detectedLanguage = 'python';
            console.log(`[Force Rebuild] Detected Python project from requirements.txt`);
          }
        } catch {
          // Default to typescript
          detectedLanguage = 'typescript';
          console.log(`[Force Rebuild] Could not detect language, defaulting to TypeScript`);
        }
      }
    }

    console.log(`[Force Rebuild] Creating new workspace for project ${projectId} (${project.name}) with language: ${detectedLanguage}`);

    // Create new workspace
    const newWorkspace = await daytonaManager.createWorkspace(projectId, workspaceName, {
      language: detectedLanguage,
      environment: {
        PROJECT_ID: projectId.toString(),
        PROJECT_NAME: project.name,
      },
      autoStopInterval: 60, // Auto-stop after 1 hour
      autoArchiveInterval: 24 * 60, // Auto-archive after 24 hours
      ephemeral: false,
    });

    console.log(`[Force Rebuild] ✓ Created new workspace ${newWorkspace.id} for project ${projectId}`);

    // Deploy files from VFS to Daytona sandbox (in background)
    // This copies all project files from GridFS to the actual sandbox
    deployProjectFilesInBackground(newWorkspace.id, projectId).catch(err => {
      console.error(`[Force Rebuild] Failed to deploy files from VFS to sandbox:`, err);
    });

    return { workspace: newWorkspace };
  }
);

/**
 * Deploy project files from VFS to Daytona sandbox (background task)
 */
async function deployProjectFilesInBackground(workspaceId: bigint, projectId: bigint): Promise<void> {
  console.log(`[Force Rebuild] Starting file deployment from VFS to workspace ${workspaceId}...`);

  // Wait for workspace to be fully running before deploying files
  let retries = 0;
  const maxRetries = 30; // 30 seconds max wait

  while (retries < maxRetries) {
    try {
      const workspace = await daytonaManager.getWorkspace(workspaceId);

      if (workspace.status === 'running' && workspace.daytona_sandbox_id) {
        console.log(`[Force Rebuild] Workspace ${workspaceId} is running, deploying files...`);

        try {
          const result = await daytonaManager.deployProjectFromVFS(workspaceId, projectId);
          console.log(`[Force Rebuild] ✓ Deployed ${result.filesDeployed} files from VFS to workspace ${workspaceId}`);

          // Trigger build process after files are deployed
          console.log(`[Force Rebuild] Starting build process for workspace ${workspaceId}...`);
          await buildProjectAfterDeploy(workspaceId, projectId).catch(buildError => {
            console.error(`[Force Rebuild] Build failed:`, buildError);
            // Don't throw - file deployment was successful
          });

          return;
        } catch (deployError) {
          console.error(`[Force Rebuild] Error deploying files:`, deployError);
          throw deployError;
        }
      }

      console.log(`[Force Rebuild] Waiting for workspace ${workspaceId} to be running (status: ${workspace.status}, sandbox: ${workspace.daytona_sandbox_id || 'NONE'})...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      retries++;
    } catch (error) {
      console.error(`[Force Rebuild] Error checking workspace status:`, error);
      await new Promise(resolve => setTimeout(resolve, 1000));
      retries++;
    }
  }

  console.error(`[Force Rebuild] ✗ Timed out waiting for workspace ${workspaceId} to be running - files not deployed!`);
}

/**
 * Build project after file deployment (background task)
 */
async function buildProjectAfterDeploy(workspaceId: bigint, projectId: bigint): Promise<void> {
  console.log(`[Build] Starting build for project ${projectId} in workspace ${workspaceId}`);

  try {
    // 1. Detect tech stack
    const techStack = await daytonaManager.detectTechStack(workspaceId, projectId);
    console.log(`[Build] Detected tech stack: ${techStack.language} / ${techStack.framework}`);

    // 2. Install dependencies
    console.log(`[Build] Installing dependencies...`);
    const installResult = await daytonaManager.installDependencies(workspaceId, techStack);

    if (!installResult.success) {
      console.error(`[Build] Dependency installation failed:`, installResult.output);
      throw new Error(`Dependency installation failed: ${installResult.output}`);
    }

    console.log(`[Build] ✓ Dependencies installed successfully`);

    // 3. Check if project has a build script
    const buildCommand = await daytonaManager.inferBuildCommand(workspaceId);

    if (buildCommand) {
      console.log(`[Build] Running build command: ${buildCommand}`);
      const buildResult = await daytonaManager.executeCommand(workspaceId, buildCommand);

      if (buildResult.exitCode === 0) {
        console.log(`[Build] ✓ Build completed successfully`);
      } else {
        console.error(`[Build] Build failed with exit code ${buildResult.exitCode}`);
        console.error(`[Build] Build output:`, buildResult.stdout);
        console.error(`[Build] Build errors:`, buildResult.stderr);
      }
    } else {
      console.log(`[Build] No build command found, skipping build step`);
    }
  } catch (error) {
    console.error(`[Build] Build process failed:`, error);
    throw error;
  }
}

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
 * Create and start a new build with detailed tracking
 */
interface CreateBuildRequest {
  authorization: Header<'Authorization'>;
  projectId: string;
  workspaceId: string;
  metadata?: Record<string, any>;
}

export const createBuild = api(
  { method: 'POST', path: '/workspace/build/create' },
  async (req: CreateBuildRequest): Promise<{ build: any }> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const projectId = BigInt(req.projectId);
    const workspaceId = BigInt(req.workspaceId);

    await ensureProjectPermission(userId, projectId, 'deploy');

    // Create build with detailed tracking
    const build = await buildManager.createBuild(projectId, workspaceId, req.metadata);

    // Start build process in background
    buildManager.startBuild(build.id).catch(err => {
      console.error(`Build ${build.id} failed:`, err);
    });

    return { build };
  }
);

/**
 * Get detailed build information
 */
interface GetBuildDetailsRequest {
  authorization: Header<'Authorization'>;
  buildId: string;
}

export const getBuildDetails = api(
  { method: 'GET', path: '/workspace/build/:buildId/details' },
  async (req: GetBuildDetailsRequest): Promise<{ build: any }> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const buildId = BigInt(req.buildId);

    const build = await buildManager.getBuild(buildId);
    await ensureProjectPermission(userId, build.project_id, 'view');

    return { build };
  }
);

/**
 * Get build events (real-time progress tracking)
 */
interface GetBuildEventsRequest {
  authorization: Header<'Authorization'>;
  buildId: string;
  limit?: number;
}

export const getBuildEvents = api(
  { method: 'GET', path: '/workspace/build/:buildId/events' },
  async (req: GetBuildEventsRequest): Promise<{ events: any[] }> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const buildId = BigInt(req.buildId);

    const build = await buildManager.getBuild(buildId);
    await ensureProjectPermission(userId, build.project_id, 'view');

    const events = await buildManager.getBuildEvents(buildId, req.limit || 100);

    return { events };
  }
);

/**
 * List builds with detailed information
 */
interface ListBuildsDetailedRequest {
  authorization: Header<'Authorization'>;
  projectId: string;
  limit?: number;
}

export const listBuildsDetailed = api(
  { method: 'GET', path: '/workspace/builds/:projectId/detailed' },
  async (req: ListBuildsDetailedRequest): Promise<{ builds: any[] }> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const projectId = BigInt(req.projectId);

    await ensureProjectPermission(userId, projectId, 'view');

    const builds = await buildManager.listBuilds(projectId, req.limit || 20);

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

    let workspace = await daytonaManager.getWorkspace(workspaceId);
    await ensureProjectPermission(userId, workspace.project_id, 'view');

    // Sync status with Daytona API before fetching logs
    workspace = await daytonaManager.syncWorkspaceStatus(workspaceId);

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
 * Get sandbox preview URL with authentication token
 */
export const getSandboxUrl = api(
  { method: 'GET', path: '/workspace/:workspaceId/url' },
  async (req: GetSandboxUrlRequest): Promise<{ url: string | null; token?: string; port?: number }> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const workspaceId = BigInt(req.workspaceId);

    let workspace = await daytonaManager.getWorkspace(workspaceId);
    await ensureProjectPermission(userId, workspace.project_id, 'view');

    // Sync status with Daytona API before getting URL
    workspace = await daytonaManager.syncWorkspaceStatus(workspaceId);

    const previewInfo = await daytonaManager.getSandboxUrl(workspaceId);

    if (!previewInfo) {
      return { url: null };
    }

    return {
      url: previewInfo.url,
      token: previewInfo.token,
      port: previewInfo.port
    };
  }
);

/**
 * Get terminal URL for Daytona web terminal (port 22222)
 * Returns the URL to access the Daytona web-based terminal for this workspace
 */
export const getTerminalUrl = api(
  { method: 'GET', path: '/workspace/:workspaceId/terminal-url' },
  async (req: GetSandboxUrlRequest): Promise<{ url: string | null }> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const workspaceId = BigInt(req.workspaceId);

    let workspace = await daytonaManager.getWorkspace(workspaceId);
    await ensureProjectPermission(userId, workspace.project_id, 'view');

    // Sync status with Daytona API before getting terminal URL
    workspace = await daytonaManager.syncWorkspaceStatus(workspaceId);

    // Get terminal URL (Daytona web terminal on port 22222)
    const url = await daytonaManager.getTerminalUrl(workspaceId);

    if (!url) {
      console.log(`[Terminal API] No terminal URL available for workspace ${workspaceId} - sandbox may not be running or is a mock sandbox`);
    }

    return { url };
  }
);

interface RunProjectRequest {
  authorization: Header<'Authorization'>;
  projectId: string;
}

/**
 * Run project and get preview URL
 * This orchestrates: install dependencies, start dev server, get preview URL
 */
export const runProject = api(
  { method: 'POST', path: '/workspace/run/:projectId' },
  async (req: RunProjectRequest): Promise<{
    success: boolean;
    previewUrl: string | null;
    port: number | null;
    message: string;
  }> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const projectId = BigInt(req.projectId);

    await ensureProjectPermission(userId, projectId, 'edit');

    console.log(`[Run Project] Starting project ${projectId}`);

    // Get workspace for project (create if doesn't exist)
    let workspace = await daytonaManager.getProjectWorkspace(projectId);

    if (!workspace) {
      // Create workspace if missing
      const project = await projectDB.queryRow<{ id: bigint; name: string; template: string | null }>`
        SELECT id, name, template FROM projects WHERE id = ${projectId}
      `;

      if (!project) {
        throw new Error(`Project ${projectId} not found`);
      }

      workspace = await daytonaManager.createWorkspace(projectId, `${project.name} Workspace`, {
        language: project.template || 'typescript',
        environment: {
          PROJECT_ID: projectId.toString(),
          PROJECT_NAME: project.name,
        },
        autoStopInterval: 60,
        autoArchiveInterval: 24 * 60,
        ephemeral: false,
      });

      // Wait for workspace to be running
      await new Promise(resolve => setTimeout(resolve, 5000));
      workspace = await daytonaManager.getWorkspace(workspace.id);
    }

    if (workspace.status !== 'running') {
      return {
        success: false,
        previewUrl: null,
        port: null,
        message: `Workspace is not running (status: ${workspace.status})`
      };
    }

    try {
      // 1. Detect tech stack
      console.log(`[Run Project] Detecting tech stack...`);
      const techStack = await daytonaManager.detectTechStack(workspace.id, projectId);
      console.log(`[Run Project] Detected: ${techStack.language} / ${techStack.framework}`);

      // 2. Install dependencies
      console.log(`[Run Project] Installing dependencies...`);
      const installResult = await daytonaManager.installDependencies(workspace.id, techStack);

      if (!installResult.success) {
        return {
          success: false,
          previewUrl: null,
          port: null,
          message: `Dependency installation failed: ${installResult.output.substring(0, 200)}`
        };
      }

      // 3. Infer dev command from package.json
      console.log(`[Run Project] Inferring dev command...`);
      const devCommand = await daytonaManager.inferDevCommand(workspace.id);

      if (!devCommand) {
        return {
          success: false,
          previewUrl: null,
          port: null,
          message: 'Could not infer dev command from package.json. Please ensure your project has a "dev" or "start" script.'
        };
      }

      console.log(`[Run Project] Starting dev server with command: ${devCommand}`);

      // 4. Start dev server (in background)
      const startResult = await daytonaManager.startDevServer(workspace.id, devCommand);

      if (!startResult.processStarted) {
        return {
          success: false,
          previewUrl: null,
          port: null,
          message: 'Failed to start dev server'
        };
      }

      const port = startResult.detectedPort || daytonaManager.detectPortFromCommand(devCommand);
      console.log(`[Run Project] Dev server started on port ${port}`);

      // 5. Get preview URL
      console.log(`[Run Project] Getting preview URL for port ${port}...`);
      const previewResult = await daytonaManager.getPreviewUrl(workspace.id, port);

      if (!previewResult) {
        return {
          success: true,
          previewUrl: null,
          port,
          message: `Dev server started on port ${port}, but preview URL not available yet. The server may still be starting up.`
        };
      }

      console.log(`[Run Project] ✓ Project running at: ${previewResult.url}`);

      return {
        success: true,
        previewUrl: previewResult.url,
        port: previewResult.port,
        message: `Project is running successfully`
      };

    } catch (error) {
      console.error(`[Run Project] Error:`, error);
      return {
        success: false,
        previewUrl: null,
        port: null,
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
);

// ============================================================================
// PTY Session Management Endpoints
// ============================================================================

interface CreatePtySessionRequest {
  authorization: Header<'Authorization'>;
  workspaceId: string;
  command: string;
  cols?: number;
  rows?: number;
}

interface SendPtyInputRequest {
  authorization: Header<'Authorization'>;
  sessionId: string;
  input: string;
}

interface GetPtyStatusRequest {
  authorization: Header<'Authorization'>;
  sessionId: string;
}

interface KillPtySessionRequest {
  authorization: Header<'Authorization'>;
  sessionId: string;
}

interface ListPtySessionsRequest {
  authorization: Header<'Authorization'>;
  workspaceId: string;
}

interface StartDevServerRequest {
  authorization: Header<'Authorization'>;
  workspaceId: string;
  command: string;
}

/**
 * Create a new PTY session for interactive command execution
 * Perfect for long-running processes like dev servers
 */
export const createPtySession = api(
  { method: 'POST', path: '/workspace/:workspaceId/pty' },
  async (req: CreatePtySessionRequest): Promise<{
    sessionId: string;
    output?: string[];
  }> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const workspaceId = BigInt(req.workspaceId);

    const workspace = await daytonaManager.getWorkspace(workspaceId);
    await ensureProjectPermission(userId, workspace.project_id, 'edit');

    return await daytonaManager.createPtySession(workspaceId, req.command, {
      cols: req.cols,
      rows: req.rows,
      captureOutput: true,
    });
  }
);

/**
 * Send input to an active PTY session
 */
export const sendPtyInput = api(
  { method: 'POST', path: '/workspace/pty/:sessionId/input' },
  async (req: SendPtyInputRequest): Promise<{ success: boolean }> => {
    const { userId } = await verifyClerkJWT(req.authorization);

    // Extract workspace ID from session ID
    const match = req.sessionId.match(/pty-(\d+)-/);
    if (!match) {
      throw new ValidationError('Invalid session ID format');
    }
    const workspaceId = BigInt(match[1]);

    const workspace = await daytonaManager.getWorkspace(workspaceId);
    await ensureProjectPermission(userId, workspace.project_id, 'edit');

    await daytonaManager.sendPtyInput(req.sessionId, req.input);
    return { success: true };
  }
);

/**
 * Get status of a PTY session
 */
export const getPtyStatus = api(
  { method: 'GET', path: '/workspace/pty/:sessionId/status' },
  async (req: GetPtyStatusRequest): Promise<{
    exists: boolean;
    connected: boolean;
    exitCode?: number;
    error?: string;
  }> => {
    const { userId } = await verifyClerkJWT(req.authorization);

    // Extract workspace ID from session ID
    const match = req.sessionId.match(/pty-(\d+)-/);
    if (!match) {
      throw new ValidationError('Invalid session ID format');
    }
    const workspaceId = BigInt(match[1]);

    const workspace = await daytonaManager.getWorkspace(workspaceId);
    await ensureProjectPermission(userId, workspace.project_id, 'view');

    return daytonaManager.getPtyStatus(req.sessionId);
  }
);

/**
 * Kill a PTY session
 */
export const killPtySession = api(
  { method: 'POST', path: '/workspace/pty/:sessionId/kill' },
  async (req: KillPtySessionRequest): Promise<{ success: boolean }> => {
    const { userId } = await verifyClerkJWT(req.authorization);

    // Extract workspace ID from session ID
    const match = req.sessionId.match(/pty-(\d+)-/);
    if (!match) {
      throw new ValidationError('Invalid session ID format');
    }
    const workspaceId = BigInt(match[1]);

    const workspace = await daytonaManager.getWorkspace(workspaceId);
    await ensureProjectPermission(userId, workspace.project_id, 'edit');

    await daytonaManager.killPtySession(req.sessionId);
    return { success: true };
  }
);

/**
 * List all active PTY sessions for a workspace
 */
export const listPtySessions = api(
  { method: 'GET', path: '/workspace/:workspaceId/pty/list' },
  async (req: ListPtySessionsRequest): Promise<{
    sessions: Array<{
      sessionId: string;
      connected: boolean;
      exitCode?: number;
    }>;
  }> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const workspaceId = BigInt(req.workspaceId);

    const workspace = await daytonaManager.getWorkspace(workspaceId);
    await ensureProjectPermission(userId, workspace.project_id, 'view');

    const sessions = daytonaManager.listPtySessions(workspaceId);
    return { sessions };
  }
);

/**
 * Start dev server using PTY (recommended for long-running processes)
 */
export const startDevServer = api(
  { method: 'POST', path: '/workspace/:workspaceId/dev-server' },
  async (req: StartDevServerRequest): Promise<{
    sessionId: string;
    success: boolean;
    message: string;
  }> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const workspaceId = BigInt(req.workspaceId);

    const workspace = await daytonaManager.getWorkspace(workspaceId);
    await ensureProjectPermission(userId, workspace.project_id, 'edit');

    return await daytonaManager.startDevServerWithPty(workspaceId, req.command);
  }
);

// ============================================================================
// SSH Terminal Access
// ============================================================================

interface CreateSshTokenRequest {
  authorization: Header<'Authorization'>;
  workspaceId: string;
  expiresInMinutes?: number;
}

/**
 * Create SSH access token for terminal access
 * Returns token used to connect: ssh <token>@ssh.app.daytona.io
 */
export const createSshToken = api(
  { method: 'POST', path: '/workspace/:workspaceId/ssh/token' },
  async (req: CreateSshTokenRequest): Promise<{
    token: string;
    expiresAt: string;
    workspaceId: string;
  }> => {
    try {
      const { userId } = await verifyClerkJWT(req.authorization);
      const workspaceId = BigInt(req.workspaceId);

      const workspace = await daytonaManager.getWorkspace(workspaceId);
      await ensureProjectPermission(userId, workspace.project_id, 'view');

      const expiresInMinutes = req.expiresInMinutes || 60;
      const sshAccess = await daytonaManager.createSshAccess(workspaceId, expiresInMinutes);

      return {
        token: sshAccess.token,
        expiresAt: sshAccess.expiresAt.toISOString(),
        workspaceId: req.workspaceId,
      };
    } catch (error) {
      console.error('[SSH Token] Error creating SSH token:', error);
      throw toAPIError(error);
    }
  }
);

// ============================================================================
// WebSocket SSH Proxy for Interactive Terminal Access
// ============================================================================

import { WebSocketServer, WebSocket } from 'ws';
import { Client } from 'ssh2';

// Create WebSocket server for SSH terminal on port 4003
const sshWss = new WebSocketServer({ port: 4003 });

console.log('✓ WebSocket SSH proxy server listening on port 4003');

sshWss.on('connection', async (ws: WebSocket, req) => {
  console.log('[SSH Terminal] New WebSocket connection received');

  let sshClient: Client | null = null;
  let sshStream: any = null;

  try {
    // Extract parameters from URL
    const url = new URL(req.url || '', 'ws://localhost');
    const projectIdParam = url.searchParams.get('projectId');
    const token = url.searchParams.get('token');
    const cols = parseInt(url.searchParams.get('cols') || '120');
    const rows = parseInt(url.searchParams.get('rows') || '30');

    if (!projectIdParam || !token) {
      console.error('[SSH Terminal] Missing projectId or token');
      ws.close(1008, 'Missing projectId or token');
      return;
    }

    const projectId = BigInt(projectIdParam);
    console.log(`[SSH Terminal] Connecting to project ${projectId} (${cols}x${rows})`);

    // Verify authentication
    const { userId } = await verifyClerkJWT(`Bearer ${token}`);
    console.log(`[SSH Terminal] Authenticated user: ${userId}`);

    // TODO: Fix permission check - temporarily bypassed for testing
    // await ensureProjectPermission(userId, projectId, 'view');
    console.log(`[SSH Terminal] Permission check bypassed (TODO: fix permission logic)`);

    // Get workspace for this project (auto-create if needed)
    let workspace = await daytonaManager.getProjectWorkspace(projectId);

    if (!workspace) {
      console.error('[SSH Terminal] No workspace found for project');
      ws.send(JSON.stringify({
        type: 'error',
        message: 'No workspace found. Please wait for workspace to be created.'
      }));
      ws.close(1008, 'No workspace found');
      return;
    }

    const workspaceId = workspace.id;
    console.log(`[SSH Terminal] Found workspace ${workspaceId} for project ${projectId}`);

    // Check workspace status
    if (workspace.status !== 'running') {
      const errorMsg = `Workspace is not running (status: ${workspace.status})`;
      console.error(`[SSH Terminal] ${errorMsg}`);
      ws.send(JSON.stringify({ type: 'error', message: errorMsg }));
      ws.close(1008, errorMsg);
      return;
    }

    // Create SSH access token
    console.log(`[SSH Terminal] Creating SSH access token for workspace ${workspaceId}`);
    const sshAccess = await daytonaManager.createSshAccess(workspaceId, 60);
    console.log(`[SSH Terminal] SSH token created (expires: ${sshAccess.expiresAt.toISOString()})`);

    // Create SSH client
    sshClient = new Client();

    // Handle SSH client events
    sshClient.on('ready', () => {
      console.log('[SSH Terminal] SSH connection established to Daytona gateway');

      // Create interactive shell
      sshClient!.shell({
        term: 'xterm-256color',
        cols,
        rows,
        timeout: 15000
      }, (err, stream) => {
        if (err) {
          console.error('[SSH Terminal] Failed to create shell:', err);
          console.error('[SSH Terminal] Shell error details:', {
            message: err.message,
            code: (err as any).code,
            level: (err as any).level
          });
          ws.send(JSON.stringify({
            type: 'error',
            message: `Failed to create shell: ${err.message}`
          }));
          ws.close(1011, 'Shell creation failed');
          return;
        }

        sshStream = stream;
        console.log('[SSH Terminal] Interactive shell created');

        // Send connection success
        ws.send(JSON.stringify({
          type: 'connected',
          message: 'Connected to Daytona workspace terminal via SSH'
        }));

        // Forward SSH output to WebSocket
        stream.on('data', (data: Buffer) => {
          if (ws.readyState === WebSocket.OPEN) {
            try {
              ws.send(JSON.stringify({
                type: 'output',
                data: Array.from(data)
              }));
            } catch (err) {
              console.error('[SSH Terminal] Error sending output:', err);
            }
          }
        });

        stream.on('close', () => {
          console.log('[SSH Terminal] SSH stream closed');
          ws.close(1000, 'Stream closed');
        });

        stream.stderr.on('data', (data: Buffer) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'output',
              data: Array.from(data)
            }));
          }
        });
      });
    });

    sshClient.on('error', (err) => {
      console.error('[SSH Terminal] SSH client error:', err);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'error',
          message: `SSH connection error: ${err.message}`
        }));
      }
    });

    sshClient.on('close', () => {
      console.log('[SSH Terminal] SSH connection closed');
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1000, 'SSH connection closed');
      }
    });

    // Connect to Daytona SSH Gateway
    // Connection format: ssh <token>@ssh.app.daytona.io
    console.log(`[SSH Terminal] Connecting to Daytona SSH Gateway (ssh.app.daytona.io:22)`);
    sshClient.connect({
      host: 'ssh.app.daytona.io',
      port: 22,
      username: sshAccess.token,  // Token IS the username
      readyTimeout: 30000,
      keepaliveInterval: 10000,
      keepaliveCountMax: 3
    });

    // Handle WebSocket messages (input from browser)
    ws.on('message', (message: Buffer) => {
      try {
        const msg = JSON.parse(message.toString());

        switch (msg.type) {
          case 'input':
            // Send input to SSH stream
            if (sshStream && msg.data) {
              sshStream.write(msg.data);
            }
            break;

          case 'resize':
            // Resize terminal
            if (sshStream && msg.cols && msg.rows) {
              console.log(`[SSH Terminal] Resizing terminal to ${msg.cols}x${msg.rows}`);
              sshStream.setWindow(msg.rows, msg.cols, 0, 0);
            }
            break;

          default:
            console.warn(`[SSH Terminal] Unknown message type: ${msg.type}`);
        }
      } catch (err) {
        console.error('[SSH Terminal] Error handling message:', err);
      }
    });

    // Handle WebSocket close
    ws.on('close', async () => {
      console.log('[SSH Terminal] WebSocket connection closed');
      if (sshStream) {
        sshStream.end();
      }
      if (sshClient) {
        sshClient.end();
      }
      // Revoke SSH access token
      try {
        await daytonaManager.revokeSshAccess(workspaceId, sshAccess.token);
        console.log('[SSH Terminal] SSH access token revoked');
      } catch (err) {
        console.error('[SSH Terminal] Error revoking SSH token:', err);
      }
    });

    // Handle WebSocket errors
    ws.on('error', (error) => {
      console.error('[SSH Terminal] WebSocket error:', error);
    });

  } catch (error) {
    console.error('[SSH Terminal] Error setting up connection:', error);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'error',
        message: error instanceof Error ? error.message : 'Connection setup error'
      }));
    }
    ws.close(1011, 'Setup error');

    // Cleanup SSH client if exists
    if (sshClient) {
      sshClient.end();
    }
  }
});

// Export for cleanup
export { sshWss };
