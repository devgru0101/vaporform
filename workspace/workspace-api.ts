/**
 * Workspace API endpoints
 * Provides Daytona workspace management with RBAC
 */

import { api, Header, Query, APIError } from 'encore.dev/api';
import log from 'encore.dev/log';
import { verifyClerkJWT } from '../shared/clerk-auth.js';
import { ensureProjectPermission } from '../projects/permissions.js';
import { daytonaManager } from './daytona-manager.js';
import { buildManager } from './build-manager.js';
import { syncManager } from './sync-manager.js';
import { ValidationError, toAPIError } from '../shared/errors.js';
import { db as projectDB } from '../projects/db.js';

/**
 * Helper function to trigger auto-build if needed
 * Checks if project needs a build and triggers it asynchronously
 */
async function triggerAutoBuildIfNeeded(projectId: bigint, workspaceId: bigint): Promise<void> {
  try {
    // Check if project needs auto-build
    const builds = await buildManager.listBuilds(projectId, 1);

    // Trigger build if no builds exist OR last build failed OR last successful build is old
    let shouldBuild = false;

    if (builds.length === 0) {
      console.log(`[Auto-Build] No builds found for project ${projectId}, triggering initial build`);
      shouldBuild = true;
    } else {
      const lastBuild = builds[0];

      if (lastBuild.status === 'failed') {
        // Check if we have CONSECUTIVE failures (last 2 builds both failed)
        // If yes, skip to avoid infinite retry loop
        // If only last build failed, try once more (agent may have fixed issues)
        if (builds.length >= 2 && builds[1].status === 'failed') {
          console.log(`[Auto-Build] Multiple consecutive build failures for project ${projectId}, skipping auto-rebuild`);
          console.log(`[Auto-Build] User/agent should explicitly fix build issues and rebuild`);
          shouldBuild = false;
        } else {
          console.log(`[Auto-Build] Last build failed for project ${projectId}, but will retry once (single failure)`);
          shouldBuild = true;
        }
      } else if (lastBuild.status === 'building' || lastBuild.status === 'pending') {
        console.log(`[Auto-Build] Build already in progress for project ${projectId}`);
        shouldBuild = false;
      } else if (lastBuild.status === 'success') {
        // Don't auto-rebuild if successful build within last hour
        const hourAgo = Date.now() - (60 * 60 * 1000);
        const completedAt = lastBuild.completed_at ? lastBuild.completed_at.getTime() : 0;

        if (completedAt > hourAgo) {
          console.log(`[Auto-Build] Recent successful build exists for project ${projectId}, skipping`);
          shouldBuild = false;
        } else {
          console.log(`[Auto-Build] Last successful build is old for project ${projectId}, triggering rebuild`);
          shouldBuild = true;
        }
      }
    }

    if (shouldBuild) {
      // CRITICAL: Check if project has any code files before building
      // Prevents "build failed" on empty/newly-created projects
      console.log(`[Auto-Build] Checking if project ${projectId} has code files...`);

      try {
        const filesResult = await daytonaManager.executeCommand(workspaceId,
          'find . -type f \\( -name "*.js" -o -name "*.ts" -o -name "*.jsx" -o -name "*.tsx" -o -name "*.py" -o -name "*.go" -o -name "*.java" -o -name "*.rb" -o -name "*.php" -o -name "package.json" -o -name "requirements.txt" -o -name "go.mod" -o -name "Gemfile" -o -name "composer.json" \\) | head -10'
        );

        const hasCodeFiles = filesResult.stdout && filesResult.stdout.trim().length > 0;

        if (!hasCodeFiles) {
          console.log(`[Auto-Build] Project ${projectId} has no code files yet, skipping build`);
          console.log(`[Auto-Build] User should add code before building`);
          shouldBuild = false;
        } else {
          console.log(`[Auto-Build] Project ${projectId} has code files, proceeding with build`);
        }
      } catch (error) {
        console.warn(`[Auto-Build] Failed to check for code files:`, error);
        // If check fails, err on the side of NOT building to avoid false "build failed" 
        console.log(`[Auto-Build] Skipping build due to file check failure`);
        shouldBuild = false;
      }
    }

    if (shouldBuild) {
      console.log(`[Auto-Build] Triggering auto-build for project ${projectId}`);

      // Create and start build (BuildManager handles queue/mutex)
      const build = await buildManager.createBuild(projectId, workspaceId, {
        trigger: 'auto',
        initiatedBy: 'workspace_access',
        timestamp: new Date().toISOString()
      });

      // Start build in background (don't await)
      buildManager.startBuild(build.id).catch(err => {
        console.error(`[Auto-Build] Build ${build.id} failed:`, err);
      });

      console.log(`[Auto-Build] Build ${build.id} started for project ${projectId}`);
    }
  } catch (error) {
    console.error(`[Auto-Build] Error checking/triggering auto-build:`, error);
    // Don't throw - auto-build failures shouldn't block workspace URL retrieval
  }
}

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

interface CodeRunRequest {
  authorization: Header<'Authorization'>;
  workspaceId: string;
  code: string;
  language?: string;
  argv?: string[];
  env?: Record<string, string>;
}

interface CodeRunResponse {
  exitCode: number;
  result: string;
  artifacts?: {
    stdout: string;
    charts?: any[];
  };
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

    // Start bidirectional sync for this workspace
    try {
      await syncManager.startSync(projectId, workspace.id);
      console.log(`[Workspace API] Started VFS ↔ Daytona sync for workspace ${workspace.id}`);
    } catch (error) {
      console.error(`[Workspace API] Failed to start sync:`, error);
      // Continue anyway - sync is not critical for workspace creation
    }

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
    console.log(`[Workspace API] ========== getProjectWorkspace called ==========`);
    console.log(`[Workspace API] Project ID: ${req.projectId}`);
    console.log(`[Workspace API] waitForReady: ${req.waitForReady}`);

    const { userId } = await verifyClerkJWT(req.authorization);
    const projectId = BigInt(req.projectId);

    console.log(`[Workspace API] User ID: ${userId}`);

    await ensureProjectPermission(userId, projectId, 'view');

    console.log(`[Workspace API] Permission check passed, fetching workspace...`);

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

      // Start sync for newly created workspace
      try {
        await syncManager.startSync(projectId, workspace.id);
        console.log(`[Workspace API] Started sync for new workspace ${workspace.id}`);
      } catch (error) {
        console.error(`[Workspace API] Failed to start sync:`, error);
      }
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

    // AUTO-FIX: If workspace exists but has no Daytona sandbox, create one
    if (workspace && !workspace.daytona_sandbox_id) {
      console.log(`[Workspace Manager] ⚠️  Workspace ${workspace.id} has no Daytona sandbox ID - auto-creating...`);

      try {
        // Get project details for sandbox creation
        const project = await projectDB.queryRow<{ id: bigint; name: string; template: string | null }>`
          SELECT id, name, template FROM projects WHERE id = ${projectId}
        `;

        if (project) {
          const template = project.template || 'typescript';

          console.log(`[Workspace Manager] Starting Daytona sandbox for workspace ${workspace.id}...`);

          // Start the workspace (creates Daytona sandbox)
          await daytonaManager.getLifecycle().startWorkspace(workspace.id, {
            language: template,
            environment: {
              PROJECT_ID: projectId.toString(),
              PROJECT_NAME: project.name,
            },
            autoStopInterval: 60,
            autoArchiveInterval: 24 * 60,
            ephemeral: false,
          });

          console.log(`[Workspace Manager] ✓ Auto-created Daytona sandbox for workspace ${workspace.id}`);

          // Refresh workspace to get updated sandbox_id
          workspace = await daytonaManager.getProjectWorkspace(projectId);
        }
      } catch (error) {
        console.error(`[Workspace Manager] ✗ Failed to auto-create Daytona sandbox:`, error);
        // Don't throw - let the request continue with the workspace in its current state
      }
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

    // Trigger auto-build if needed (non-blocking)
    // This runs whenever a project is opened in the editor
    if (workspace) {
      console.log(`[Auto-Build] ========== AUTO-BUILD TRIGGER POINT ==========`);
      console.log(`[Auto-Build] Project ID: ${projectId}`);
      console.log(`[Auto-Build] Workspace ID: ${workspace.id}`);
      console.log(`[Auto-Build] Workspace Status: ${workspace.status}`);
      console.log(`[Auto-Build] Calling triggerAutoBuildIfNeeded()...`);

      triggerAutoBuildIfNeeded(projectId, workspace.id).catch(err => {
        console.error(`[Auto-Build] ❌ Failed to trigger auto-build:`, err);
      });

      console.log(`[Auto-Build] Auto-build trigger initiated (non-blocking)`);
    } else {
      console.log(`[Auto-Build] ⚠ Skipping auto-build - no workspace exists`);
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

    // Stop sync before deleting workspace
    try {
      await syncManager.stopSync(workspace.project_id);
      console.log(`[Workspace API] Stopped sync for project ${workspace.project_id}`);
    } catch (error) {
      console.error(`[Workspace API] Failed to stop sync:`, error);
    }

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
    log.info('Force Rebuild request received', { projectId: req.projectId });

    try {
      const { userId } = await verifyClerkJWT(req.authorization);
      log.info('Force Rebuild user authenticated', { userId, projectId: req.projectId });

      const projectId = BigInt(req.projectId);

      await ensureProjectPermission(userId, projectId, 'edit');
      log.info('Force Rebuild permissions validated', { userId, projectId });

      log.info('Force Rebuild starting', { projectId });

      // Get existing workspace if it exists
      const existingWorkspace = await daytonaManager.getProjectWorkspace(projectId);

      if (existingWorkspace) {
        log.info('Force Rebuild deleting existing workspace', { workspaceId: existingWorkspace.id, projectId });
        try {
          await daytonaManager.deleteWorkspace(existingWorkspace.id);
          log.info('Force Rebuild deleted workspace successfully', { workspaceId: existingWorkspace.id });
        } catch (error) {
          log.error('Force Rebuild workspace deletion failed', { error, workspaceId: existingWorkspace.id });
          // Continue even if delete fails - we'll create a new one anyway
        }
      } else {
        log.info('Force Rebuild no existing workspace found', { projectId });
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
            log.info('Force Rebuild detected Node.js/TypeScript project', { projectId });
          }
        } catch {
          // Check for requirements.txt (Python)
          try {
            const reqBuffer = await gridfs.readFile(projectId, '/requirements.txt');
            if (reqBuffer) {
              detectedLanguage = 'python';
              log.info('Force Rebuild detected Python project', { projectId });
            }
          } catch {
            // Default to typescript
            detectedLanguage = 'typescript';
            log.info('Force Rebuild defaulting to TypeScript', { projectId });
          }
        }
      }

      log.info('Force Rebuild creating new workspace', { projectId, projectName: project.name, language: detectedLanguage });

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

      log.info('Force Rebuild created new workspace', { workspaceId: newWorkspace.id, projectId });

      // Deploy files from VFS to Daytona sandbox (await to ensure readiness)
      // This copies all project files from GridFS to the actual sandbox
      try {
        await deployProjectFilesInBackground(newWorkspace.id, projectId);
      } catch (err) {
        log.error('Force Rebuild file deployment failed', { error: err, workspaceId: newWorkspace.id, projectId });
        // We still return the workspace, but log the error. 
        // Ideally we might want to fail the request or mark workspace as degraded.
      }

      return { workspace: newWorkspace };
    } catch (error) {
      log.error('Force Rebuild CRITICAL FAILURE', { error, projectId: req.projectId });
      throw error;
    }
  }
);

/**
 * Deploy project files from VFS to Daytona sandbox (background task)
 */
async function deployProjectFilesInBackground(workspaceId: bigint, projectId: bigint): Promise<void> {
  log.info('Force Rebuild starting file deployment', { workspaceId, projectId });

  // Wait for workspace to be fully running before deploying files
  let retries = 0;
  const maxRetries = 30; // 30 seconds max wait

  while (retries < maxRetries) {
    try {
      const workspace = await daytonaManager.getWorkspace(workspaceId);

      if (workspace.status === 'running' && workspace.daytona_sandbox_id) {
        log.info('Force Rebuild workspace ready, deploying files', { workspaceId, status: workspace.status });

        try {
          // Start build to get buildId for progress tracking
          const build = await daytonaManager.buildProject(projectId, workspaceId);
          log.info('Force Rebuild created build for tracking', { buildId: build.id, workspaceId, projectId });

          // Deploy files with buildId for progress events
          const result = await daytonaManager.deployProjectFromVFS(workspaceId, projectId, undefined, build.id);
          log.info('Force Rebuild deployed files successfully', { filesDeployed: result.filesDeployed, workspaceId, projectId });

          return;
        } catch (deployError) {
          log.error('Force Rebuild deployment error', { error: deployError, workspaceId, projectId });
          throw deployError;
        }
      }

      log.info('Force Rebuild waiting for workspace', { workspaceId, status: workspace.status, retries });
      await new Promise(resolve => setTimeout(resolve, 1000));
      retries++;
    } catch (error) {
      log.error('Force Rebuild workspace status check failed', { error, workspaceId, retries });
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
 * Execute AI-generated code in workspace with artifact capture
 * Uses Daytona's codeRun API for optimized code execution
 */
export const codeRun = api(
  { method: 'POST', path: '/workspace/:workspaceId/code-run' },
  async (req: CodeRunRequest): Promise<CodeRunResponse> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const workspaceId = BigInt(req.workspaceId);

    const workspace = await daytonaManager.getWorkspace(workspaceId);
    await ensureProjectPermission(userId, workspace.project_id, 'edit');

    if (!req.code || req.code.trim().length === 0) {
      throw toAPIError(new ValidationError('Code is required'));
    }

    const result = await daytonaManager.codeRun(
      workspaceId,
      req.code,
      {
        argv: req.argv,
        env: req.env
      },
      30 // default timeout
    );

    return {
      ...result,
      result: result.stdout // Map stdout to result field expected by CodeRunResponse
    };
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
 * Also triggers auto-build if project needs it
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

    // Trigger auto-build if needed (non-blocking)
    triggerAutoBuildIfNeeded(workspace.project_id, workspaceId).catch(err => {
      console.error(`[Auto-Build] Failed to trigger auto-build:`, err);
    });

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
      throw toAPIError(error as any);
    }
  }
);

// ============================================================================
// WebSocket SSH Proxy for Interactive Terminal Access
// ============================================================================

import { WebSocketServer, WebSocket } from 'ws';
import { Client } from 'ssh2';

// Create WebSocket server for SSH terminal on port 4003 (singleton pattern for hot reload)
let sshWss: WebSocketServer;
try {
  // Check if port is already in use (from previous hot reload)
  sshWss = new WebSocketServer({ port: 4003 });
  console.log('✓ WebSocket SSH proxy server listening on port 4003');
} catch (error: any) {
  if (error.code === 'EADDRINUSE') {
    console.log('⚠ WebSocket SSH proxy already running on port 4003 (hot reload detected)');
    // Create a dummy server reference - the old one will handle connections
    sshWss = new WebSocketServer({ noServer: true });
  } else {
    throw error;
  }
}

sshWss.on('connection', async (ws: WebSocket, req) => {
  console.log('[SSH Terminal] New WebSocket connection received');

  let sshClient: Client | null = null;
  let sshStream: any = null;
  let connectionTimeout: NodeJS.Timeout | null = null;
  let heartbeatInterval: NodeJS.Timeout | null = null;

  // Set connection timeout (30 seconds to establish connection)
  connectionTimeout = setTimeout(() => {
    console.error('[SSH Terminal] Connection timeout - closing WebSocket');
    if (ws.readyState === WebSocket.OPEN) {
      ws.close(1008, 'Connection timeout');
    }
    if (sshClient) {
      sshClient.end();
    }
  }, 30000);

  // Setup heartbeat to detect dead connections
  heartbeatInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
    } else {
      if (heartbeatInterval) clearInterval(heartbeatInterval);
    }
  }, 30000);

  // Handle pong responses
  ws.on('pong', () => {
    console.debug('[SSH Terminal] Heartbeat pong received');
  });

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

    // Verify project permission
    await ensureProjectPermission(userId, projectId, 'view');
    console.log(`[SSH Terminal] Permission check passed`);

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
      } as any, (err, stream) => {
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

      // Clear timeouts
      if (connectionTimeout) clearTimeout(connectionTimeout);
      if (heartbeatInterval) clearInterval(heartbeatInterval);

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

/**
 * Manual sync endpoint - force sync between VFS and Daytona
 */
export const syncWorkspace = api(
  { method: 'POST', path: '/workspace/:workspaceId/sync', expose: true },
  async ({
    authorization,
    workspaceId,
    direction = 'bidirectional'
  }: {
    authorization: Header<'Authorization'>;
    workspaceId: string;
    direction?: Query<'to-daytona' | 'to-vfs' | 'bidirectional'>;
  }): Promise<{ success: boolean; message: string }> => {
    const { userId } = await verifyClerkJWT(authorization);
    const id = BigInt(workspaceId);

    const workspace = await daytonaManager.getWorkspace(id);
    await ensureProjectPermission(userId, workspace.project_id, 'edit');

    console.log(`[Workspace API] Manual sync requested: ${direction}`);

    await syncManager.fullSync(workspace.project_id, id, direction as 'to-daytona' | 'to-vfs' | 'bidirectional');

    return {
      success: true,
      message: `Sync completed: ${direction}`
    };
  }
);

/**
 * Get sync status for a workspace
 */
export const getSyncStatus = api(
  { method: 'GET', path: '/workspace/:workspaceId/sync-status', expose: true },
  async ({
    authorization,
    workspaceId
  }: {
    authorization: Header<'Authorization'>;
    workspaceId: string;
  }): Promise<{
    isActive: boolean;
    lastVFSSync?: Date;
    lastDaytonaSync?: Date;
  }> => {
    const { userId } = await verifyClerkJWT(authorization);
    const id = BigInt(workspaceId);

    const workspace = await daytonaManager.getWorkspace(id);
    await ensureProjectPermission(userId, workspace.project_id, 'view');

    const status = syncManager.getSyncStatus(workspace.project_id);

    if (!status) {
      return {
        isActive: false,
        lastVFSSync: undefined,
        lastDaytonaSync: undefined
      };
    }

    return status;
  }
);
