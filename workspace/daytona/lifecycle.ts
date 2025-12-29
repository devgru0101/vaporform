
import { db } from '../workspace-db.js';
import { DaytonaContext, Workspace, WorkspaceStatus } from './types.js';
import { withRetry, withTimeout, normalizeDaytonaLanguage } from './utils.js';
import { ValidationError, NotFoundError } from '../../shared/errors.js';

/**
 * Emit a build event for real-time progress streaming
 */
async function emitBuildEvent(
    buildId: bigint,
    eventType: 'progress' | 'output' | 'error' | 'file_upload',
    message: string,
    metadata?: Record<string, any>
): Promise<void> {
    try {
        await db.exec`
            INSERT INTO build_events (build_id, event_type, message, metadata)
            VALUES (${buildId}, ${eventType}, ${message}, ${JSON.stringify(metadata || {})})
        `;
    } catch (error) {
        console.error('[Build Events] Failed to emit event:', error);
        // Don't throw - event emission failures shouldn't stop the build
    }
}


interface CreateSandboxFromImageParams {
    image: string;
    public: boolean;
    labels: Record<string, string>;
    autoStopInterval: number;
    autoArchiveInterval: number;
    ephemeral: boolean;
    resources?: { cpu: number; memory: number; disk: number };
    envVars?: Record<string, string>;
}

interface CreateSandboxFromSnapshotParams {
    language: string;
    public: boolean;
    labels: Record<string, string>;
    autoStopInterval: number;
    autoArchiveInterval: number;
    ephemeral: boolean;
    resources?: { cpu: number; memory: number; disk: number };
    envVars?: Record<string, string>;
}

export class DaytonaLifecycle {
    constructor(private context: DaytonaContext) { }

    /**
     * Create a workspace (Daytona Sandbox) for a project
     */
    async createWorkspace(
        projectId: bigint,
        name: string,
        options?: {
            language?: string;
            image?: string;
            resources?: { cpu: number; memory: number; disk: number };
            environment?: Record<string, string>;
            autoStopInterval?: number;
            autoArchiveInterval?: number;
            ephemeral?: boolean;
        }
    ): Promise<Workspace> {
        console.log(`[DAYTONA DEBUG] createWorkspace called for project ${projectId}`);

        const workspace = await db.queryRow<Workspace>`
      INSERT INTO workspaces (
        project_id,
        name,
        status,
        language,
        resources,
        environment,
        auto_stop_interval,
        auto_archive_interval,
        ephemeral
      )
      VALUES (
        ${projectId},
        ${name},
        'pending',
        ${options?.language || 'typescript'},
        ${options?.resources ? JSON.stringify(options.resources) : null},
        ${options?.environment ? JSON.stringify(options.environment) : null},
        ${options?.autoStopInterval || 15},
        ${options?.autoArchiveInterval || 7 * 24 * 60},
        ${options?.ephemeral || false}
      )
      RETURNING *
    `;

        if (!workspace) {
            throw new Error('Failed to create workspace');
        }

        await this.startWorkspace(workspace.id, options);
        console.log(`✓ Workspace ${workspace.id} for project ${projectId} is ready`);

        return workspace;
    }

    /**
     * Start a workspace (Create Daytona Sandbox)
     */
    async startWorkspace(
        workspaceId: bigint,
        options?: {
            language?: string;
            image?: string;
            resources?: { cpu: number; memory: number; disk: number };
            environment?: Record<string, string>;
            autoStopInterval?: number;
            autoArchiveInterval?: number;
            ephemeral?: boolean;
        }
    ): Promise<void> {
        console.log(`[DAYTONA DEBUG] startWorkspace called for workspace ${workspaceId}`);
        try {
            await db.exec`
        UPDATE workspaces
        SET status = 'starting', updated_at = NOW()
        WHERE id = ${workspaceId}
      `;

            const workspace = await db.queryRow<Workspace>`
        SELECT * FROM workspaces WHERE id = ${workspaceId}
      `;

            if (!workspace) throw new Error('Workspace not found');

            if (this.context.daytona) {
                try {
                    const sandbox = await withRetry(async () => {
                        if (options?.image) {
                            const params: CreateSandboxFromImageParams = {
                                image: options.image as any,
                                public: true,
                                labels: {
                                    vaporform_project_id: workspace.project_id.toString(),
                                    vaporform_workspace_id: workspaceId.toString(),
                                    project_name: workspace.name,
                                },
                                autoStopInterval: options.autoStopInterval || 15,
                                autoArchiveInterval: options.autoArchiveInterval || 7 * 24 * 60,
                                ephemeral: options.ephemeral || false,
                            };
                            if (options.resources) params.resources = options.resources as any;
                            if (options.environment) params.envVars = options.environment;

                            return await withTimeout(
                                this.context.daytona!.create(params),
                                120000,
                                'Sandbox creation (image)'
                            );
                        } else {
                            const rawLanguage = options?.language || workspace.language || 'typescript';
                            const language = normalizeDaytonaLanguage(rawLanguage);

                            const params: CreateSandboxFromSnapshotParams = {
                                language: language,
                                public: true,
                                labels: {
                                    vaporform_project_id: workspace.project_id.toString(),
                                    vaporform_workspace_id: workspaceId.toString(),
                                    project_name: workspace.name,
                                },
                                autoStopInterval: options?.autoStopInterval || workspace.auto_stop_interval || 15,
                                autoArchiveInterval: options?.autoArchiveInterval || workspace.auto_archive_interval || 7 * 24 * 60,
                                ephemeral: options?.ephemeral || workspace.ephemeral || false,
                            };
                            if (options?.resources) (params as any).resources = options.resources;
                            if (options?.environment) params.envVars = options.environment;

                            return await withTimeout(
                                this.context.daytona!.create(params),
                                120000,
                                'Sandbox creation (snapshot)'
                            );
                        }
                    }, 3, 2000, 'Create Daytona Sandbox');

                    console.log(`[DAYTONA DEBUG] Sandbox ${sandbox.id} created, updating database...`);

                    await db.exec`
            UPDATE workspaces
            SET
              status = 'running',
              daytona_sandbox_id = ${sandbox.id},
              started_at = NOW(),
              updated_at = NOW()
            WHERE id = ${workspaceId}
          `;

                    await this.context.addLog(workspaceId, 'info', `Sandbox ${sandbox.id} started successfully`);

                } catch (daytonaError) {
                    console.error(`[DAYTONA DEBUG] ✗ Daytona API error for workspace ${workspaceId}:`, daytonaError);
                    throw daytonaError;
                }
            } else {
                const errorMsg = 'Daytona API key not configured.';
                await db.exec`UPDATE workspaces SET status = 'error', error_message = ${errorMsg} WHERE id = ${workspaceId}`;
                throw new Error(errorMsg);
            }
        } catch (error) {
            await db.exec`UPDATE workspaces SET status = 'error', error_message = ${error instanceof Error ? error.message : 'Unknown'} WHERE id = ${workspaceId}`;
            throw error;
        }
    }

    async getWorkspace(workspaceId: bigint): Promise<Workspace> {
        const workspace = await db.queryRow<Workspace>`
      SELECT * FROM workspaces
      WHERE id = ${workspaceId}
      AND deleted_at IS NULL
    `;

        if (!workspace) {
            throw new NotFoundError(`Workspace not found: ${workspaceId}`);
        }

        return workspace;
    }

    async syncWorkspaceStatus(workspaceId: bigint): Promise<Workspace> {
        const workspace = await this.getWorkspace(workspaceId);

        if (!this.context.daytona || !workspace.daytona_sandbox_id) {
            return workspace;
        }

        if (workspace.daytona_sandbox_id.startsWith('dev-sandbox-')) {
            return workspace;
        }

        try {
            const sandbox = await this.context.daytona.get(workspace.daytona_sandbox_id);
            const daytonaState = (sandbox as any).state || (sandbox as any).status || 'unknown';

            let newStatus: WorkspaceStatus = workspace.status;

            switch (daytonaState.toLowerCase()) {
                case 'starting':
                case 'pending':
                    newStatus = 'starting';
                    break;
                case 'running':
                case 'active':
                case 'started':
                    newStatus = 'running';
                    break;
                case 'stopped':
                case 'paused':
                case 'stopping':
                    newStatus = 'stopped';
                    break;
                case 'error':
                case 'failed':
                    newStatus = 'error';
                    break;
                case 'archived':
                case 'deleted':
                    newStatus = 'deleted';
                    break;
            }

            if (newStatus !== workspace.status) {
                await db.exec`
          UPDATE workspaces
          SET status = ${newStatus}, updated_at = NOW()
          WHERE id = ${workspaceId}
        `;
                workspace.status = newStatus;
            }

            return workspace;
        } catch (error) {
            if (error instanceof Error && error.message.includes('not found')) {
                await db.exec`
          UPDATE workspaces
          SET status = 'error', error_message = 'Sandbox not found in Daytona', updated_at = NOW()
          WHERE id = ${workspaceId}
        `;
                workspace.status = 'error';
                workspace.error_message = 'Sandbox not found in Daytona';
            }
            return workspace;
        }
    }

    async getProjectWorkspace(projectId: bigint): Promise<Workspace | null> {
        let workspace = await db.queryRow<Workspace>`
      SELECT * FROM workspaces
      WHERE project_id = ${projectId}
      AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `;

        if (workspace) {
            try {
                workspace = await this.syncWorkspaceStatus(workspace.id);
            } catch (error) {
                // Ignore sync error
            }
        }

        return workspace || null;
    }

    async getOrCreateWorkspace(projectId: bigint): Promise<Workspace> {
        let workspace = await this.getProjectWorkspace(projectId);

        if (workspace) {
            // If workspace exists but has no sandbox ID (and we are not in mock mode), try to start/provision it
            if (!workspace.daytona_sandbox_id && this.context.daytona) {
                console.log(`[DAYTONA] Workspace ${workspace.id} found but missing sandbox ID. Provisioning...`);
                try {
                    await this.startWorkspace(workspace.id);
                    // Refresh workspace after start
                    const refreshed = await this.getWorkspace(workspace.id);
                    if (refreshed.daytona_sandbox_id) {
                        return refreshed;
                    }
                } catch (e) {
                    console.error(`[DAYTONA] Failed to reprovision workspace ${workspace.id}:`, e);
                    // Fallthrough to return the workspace in its current state (or maybe throw?)
                }
            }
            return workspace;
        }

        const { db: projectDB } = await import('../../projects/db.js');
        const project = await projectDB.queryRow<{ id: bigint; name: string; template: string | null }>`
      SELECT id, name, template FROM projects WHERE id = ${projectId}
    `;

        if (!project) {
            throw new Error(`Project ${projectId} not found`);
        }

        const workspaceName = `${project.name} Workspace`;
        const template = project.template || 'typescript';

        workspace = await this.createWorkspace(projectId, workspaceName, {
            language: template,
            environment: {
                PROJECT_ID: projectId.toString(),
                PROJECT_NAME: project.name,
            },
            autoStopInterval: 60,
            autoArchiveInterval: 24 * 60,
            ephemeral: false,
        });

        return workspace;
    }

    async stopWorkspace(workspaceId: bigint): Promise<void> {
        const workspace = await this.getWorkspace(workspaceId);

        if (workspace.status === 'stopped') {
            return;
        }

        try {
            if (this.context.daytona && workspace.daytona_sandbox_id) {
                const sandbox = await this.context.getSandbox(workspace);
                await sandbox.stop();
            }

            await db.exec`
        UPDATE workspaces
        SET status = 'stopped', stopped_at = NOW(), updated_at = NOW()
        WHERE id = ${workspaceId}
      `;

            await this.context.addLog(workspaceId, 'info', 'Workspace stopped');
        } catch (error) {
            console.error(`Error stopping workspace ${workspaceId}:`, error);
            throw error;
        }
    }

    async restartWorkspace(workspaceId: bigint): Promise<void> {
        const workspace = await this.getWorkspace(workspaceId);

        if (workspace.status === 'running') {
            return;
        }

        if (workspace.daytona_sandbox_id && workspace.daytona_sandbox_id.startsWith('dev-sandbox-')) {
            await this.startWorkspace(workspaceId);
            return;
        }

        try {
            if (this.context.daytona && workspace.daytona_sandbox_id) {
                const sandbox = await this.context.getSandbox(workspace);
                await sandbox.start();
            }

            await db.exec`
        UPDATE workspaces
        SET status = 'running', started_at = NOW(), updated_at = NOW()
        WHERE id = ${workspaceId}
      `;

            await this.context.addLog(workspaceId, 'info', 'Workspace restarted');
        } catch (error) {
            await db.exec`
        UPDATE workspaces
        SET status = 'error', error_message = ${error instanceof Error ? error.message : 'Unknown error'}, updated_at = NOW()
        WHERE id = ${workspaceId}
      `;

            await this.context.addLog(workspaceId, 'error', `Failed to restart: ${error instanceof Error ? error.message : 'Unknown error'}`);
            throw error;
        }
    }

    async deleteWorkspace(workspaceId: bigint): Promise<void> {
        const workspace = await this.getWorkspace(workspaceId);

        try {
            if (workspace.status === 'running') {
                await this.stopWorkspace(workspaceId);
            }

            if (this.context.daytona && workspace.daytona_sandbox_id) {
                try {
                    const sandbox = await this.context.getSandbox(workspace);
                    await sandbox.delete();
                } catch (e) {
                    // Ignore delete errors (e.g. if already deleted)
                    console.warn('Sandbox delete failed (ignored):', e);
                }
            }

            await db.exec`
        UPDATE workspaces
        SET status = 'deleted', deleted_at = NOW(), updated_at = NOW()
        WHERE id = ${workspaceId}
      `;

            await this.context.addLog(workspaceId, 'info', 'Workspace deleted');
        } catch (error) {
            console.error(`Error deleting workspace ${workspaceId}:`, error);
            throw error;
        }
    }

    // New methods added

    async getLogs(workspaceId: bigint, limit: number = 100): Promise<any[]> {
        const logs: any[] = [];
        for await (const log of db.query`
          SELECT * FROM workspace_logs 
          WHERE workspace_id = ${workspaceId} 
          ORDER BY created_at DESC 
          LIMIT ${limit}
        `) {
            logs.push(log);
        }
        return logs;
    }

    async deployProjectFromVFS(
        workspaceId: bigint,
        projectId: bigint,
        paths?: string[],
        buildId?: bigint
    ): Promise<{ filesDeployed: number }> {
        console.log(`[DAYTONA] Deploying project ${projectId} from Git to workspace ${workspaceId}`);

        // Emit: Starting deployment
        if (buildId) {
            await emitBuildEvent(buildId, 'progress', '📦 Starting file deployment...');
        }

        const workspace = await this.getWorkspace(workspaceId);
        if (workspace.status !== 'running') {
            throw new ValidationError('Workspace is not running');
        }

        // Files are stored in Git, not GridFS!
        const gitRepoPath = `/tmp/vaporform-git-${projectId}`;
        const fs = await import('fs/promises');
        const path = await import('path');

        // Recursively find all files in Git repository
        async function* walkDir(dir: string): AsyncGenerator<string> {
            try {
                const entries = await fs.readdir(dir, { withFileTypes: true });
                for (const entry of entries) {
                    // Skip .git directory
                    if (entry.name === '.git') continue;

                    const fullPath = path.join(dir, entry.name);
                    if (entry.isDirectory()) {
                        yield* walkDir(fullPath);
                    } else {
                        yield fullPath;
                    }
                }
            } catch (error) {
                console.error(`[DAYTONA] Error reading directory ${dir}:`, error);
            }
        }

        const filesToUpload: { source: Buffer; destination: string }[] = [];

        // Collect all files from Git repository
        try {
            for await (const filePath of walkDir(gitRepoPath)) {
                try {
                    const content = await fs.readFile(filePath);
                    // Get relative path from git repo root
                    const relativePath = path.relative(gitRepoPath, filePath);
                    filesToUpload.push({
                        source: content,
                        destination: relativePath
                    });
                } catch (error) {
                    console.error(`[DAYTONA] Failed to read file ${filePath}:`, error);
                }
            }
        } catch (error) {
            console.error(`[DAYTONA] Error walking Git directory:`, error);
            return { filesDeployed: 0 };
        }

        console.log(`[DAYTONA] Found ${filesToUpload.length} files to upload from Git`);

        // Emit: Found files
        if (buildId) {
            await emitBuildEvent(buildId, 'progress',
                `📁 Found ${filesToUpload.length} files to deploy`,
                { totalFiles: filesToUpload.length });
        }

        let filesDeployed = 0;
        if (this.context.daytona && workspace.daytona_sandbox_id && filesToUpload.length > 0) {
            const sandbox = await this.context.getSandbox(workspace) as any;

            try {
                // Use Daytona SDK uploadFiles method for batch upload
                if (sandbox.fs && sandbox.fs.uploadFiles) {
                    console.log(`[DAYTONA] Uploading ${filesToUpload.length} files using uploadFiles (batch)`);
                    await sandbox.fs.uploadFiles(filesToUpload);
                    filesDeployed = filesToUpload.length;
                } else if (sandbox.fs && sandbox.fs.uploadFile) {
                    // Fallback to single file upload
                    console.log(`[DAYTONA] Uploading files one by one using uploadFile`);
                    for (let i = 0; i < filesToUpload.length; i++) {
                        const file = filesToUpload[i];
                        try {
                            // Emit: Individual file progress
                            if (buildId && i % 3 === 0) { // Emit every 3rd file to reduce noise
                                await emitBuildEvent(buildId, 'file_upload',
                                    `⬆️ Uploading ${i + 1}/${filesToUpload.length}: ${file.destination}`,
                                    { current: i + 1, total: filesToUpload.length, file: file.destination });
                            }
                            await sandbox.fs.uploadFile(file.source, file.destination);
                            filesDeployed++;
                        } catch (error) {
                            console.error(`[DAYTONA] Failed to upload ${file.destination}:`, error);
                        }
                    }
                } else {
                    console.error(`[DAYTONA] No uploadFile/uploadFiles method available on sandbox.fs`);
                }
            } catch (error) {
                console.error(`[DAYTONA] Error during file upload:`, error);
            }
        }

        console.log(`[DAYTONA] Successfully deployed ${filesDeployed}/${filesToUpload.length} files`);

        // Emit: Completion
        if (buildId) {
            await emitBuildEvent(buildId, 'progress',
                `✅ Successfully deployed ${filesDeployed} files`,
                { filesDeployed, totalFiles: filesToUpload.length });
        }

        return { filesDeployed };
    }

    async backupProjectFromDaytonaToVFS(workspaceId: bigint, projectId: bigint): Promise<{ filesBackedUp: number }> {
        // Placeholder
        return { filesBackedUp: 0 };
    }

    async setupImportedProject(
        workspaceId: bigint,
        projectId: bigint,
        options?: any
    ): Promise<{ success: boolean; devServerStarted: boolean; errors: string[] }> {
        const errors: string[] = [];
        try {
            await this.deployProjectFromVFS(workspaceId, projectId);

            // Note: In real impl we would auto install deps and start server?
            // Delegate that to manager/execution via Context?
            // Lifecycle shouldn't probably call execution directly if it avoids circular usage.
            // But manager calls execution.

            return { success: true, devServerStarted: false, errors };
        } catch (e) {
            errors.push((e as Error).message);
            return { success: false, devServerStarted: false, errors };
        }
    }
}
