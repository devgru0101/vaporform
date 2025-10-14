/**
 * Daytona Sandbox Manager
 * Manages secure code execution environments via Daytona SDK
 * Aligned with Daytona LLM instructions
 */

import { Daytona, CreateSandboxFromSnapshotParams, CreateSandboxFromImageParams, Image } from '@daytonaio/sdk';
import { SQLDatabase } from 'encore.dev/storage/sqldb';
import { ValidationError, NotFoundError } from '../shared/errors.js';

const db = new SQLDatabase('workspace', {
  migrations: './migrations',
});

type WorkspaceStatus = 'pending' | 'starting' | 'running' | 'stopped' | 'error' | 'deleted';
type BuildStatus = 'pending' | 'building' | 'success' | 'failed';

interface Workspace {
  id: bigint;
  project_id: bigint;
  daytona_sandbox_id?: string; // Changed from daytona_workspace_id
  name: string;
  status: WorkspaceStatus;
  language?: string; // Changed from image
  resources?: Record<string, number>; // cpu, memory, disk
  environment?: Record<string, string>;
  ports?: Record<string, number>;
  error_message?: string;
  auto_stop_interval?: number; // minutes
  auto_archive_interval?: number; // minutes
  ephemeral?: boolean;
  started_at?: Date;
  stopped_at?: Date;
  created_at: Date;
  updated_at: Date;
}

interface Build {
  id: bigint;
  project_id: bigint;
  workspace_id?: bigint;
  status: BuildStatus;
  build_logs?: string;
  error_message?: string;
  duration_ms?: number;
  started_at?: Date;
  completed_at?: Date;
  created_at: Date;
}

export class DaytonaManager {
  private daytona: Daytona | null = null;
  private apiKey: string;

  constructor() {
    const apiKey = process.env.DAYTONA_API_KEY;
    const apiUrl = process.env.DAYTONA_API_URL || 'https://app.daytona.io/api';

    if (!apiKey) {
      console.warn('DAYTONA_API_KEY not set - workspace management will be limited');
      this.apiKey = '';
      this.daytona = null;
    } else {
      this.apiKey = apiKey;
      try {
        // Initialize Daytona SDK with API key and URL
        this.daytona = new Daytona({ apiKey, apiUrl });
        console.log(`✓ Daytona SDK initialized successfully (API URL: ${apiUrl})`);
      } catch (error) {
        console.error('Failed to initialize Daytona SDK:', error);
        this.daytona = null;
      }
    }
  }

  /**
   * Map template/language names to Daytona-supported languages
   * Daytona supports: python, typescript, javascript
   */
  private normalizeDaytonaLanguage(language?: string): string {
    if (!language) return 'typescript';

    const normalized = language.toLowerCase().trim();

    // Map various template names to supported languages
    const languageMap: Record<string, string> = {
      // TypeScript variants
      'typescript': 'typescript',
      'ts': 'typescript',
      'encore': 'typescript',
      'encore-solid': 'typescript',
      'encore-react': 'typescript',
      'nextjs': 'typescript',
      'next': 'typescript',
      'react': 'typescript',
      'solid': 'typescript',
      'solidjs': 'typescript',
      'vue': 'typescript',
      'angular': 'typescript',
      'svelte': 'typescript',
      'node': 'typescript',
      'nodejs': 'typescript',

      // JavaScript variants
      'javascript': 'javascript',
      'js': 'javascript',

      // Python variants
      'python': 'python',
      'py': 'python',
      'python3': 'python',
      'django': 'python',
      'flask': 'python',
      'fastapi': 'python',
    };

    const mapped = languageMap[normalized];
    if (mapped) {
      if (mapped !== normalized) {
        console.log(`[DAYTONA] Mapped language '${language}' -> '${mapped}'`);
      }
      return mapped;
    }

    // Default to typescript for unknown languages
    console.log(`[DAYTONA] Unknown language '${language}', defaulting to 'typescript'`);
    return 'typescript';
  }

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
    console.log(`[DAYTONA DEBUG] Workspace name: "${name}"`);
    console.log(`[DAYTONA DEBUG] Options:`, JSON.stringify(options, null, 2));

    // Create workspace record in DB
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

    console.log(`[DAYTONA DEBUG] Created workspace record in DB with ID: ${workspace.id}`);
    console.log(`[DAYTONA DEBUG] Calling startWorkspace in background for workspace ${workspace.id}`);

    // Start workspace creation in background
    this.startWorkspace(workspace.id, options).catch(err => {
      console.error(`[DAYTONA DEBUG] ✗ Failed to start workspace ${workspace.id}:`, err);
    });

    console.log(`✓ Created workspace ${workspace.id} for project ${projectId}`);

    return workspace;
  }

  /**
   * Start a workspace (Create Daytona Sandbox)
   */
  private async startWorkspace(
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
    console.log(`[DAYTONA DEBUG] Daytona SDK initialized: ${this.daytona ? 'YES' : 'NO'}`);
    console.log(`[DAYTONA DEBUG] API Key present: ${this.apiKey ? 'YES (length: ' + this.apiKey.length + ')' : 'NO'}`);

    try {
      // Update status to starting
      await db.exec`
        UPDATE workspaces
        SET status = 'starting', updated_at = NOW()
        WHERE id = ${workspaceId}
      `;
      console.log(`[DAYTONA DEBUG] Updated workspace ${workspaceId} status to 'starting'`);

      const workspace = await db.queryRow<Workspace>`
        SELECT * FROM workspaces WHERE id = ${workspaceId}
      `;

      if (!workspace) {
        throw new Error('Workspace not found');
      }

      console.log(`[DAYTONA DEBUG] Workspace record found:`, {
        id: workspace.id,
        project_id: workspace.project_id,
        name: workspace.name,
        status: workspace.status,
        daytona_sandbox_id: workspace.daytona_sandbox_id
      });

      if (this.daytona) {
        console.log(`[DAYTONA DEBUG] Using Daytona SDK to create sandbox`);

        try {
          let sandbox;

          // Create sandbox using Daytona SDK
          if (options?.image) {
            console.log(`[DAYTONA DEBUG] Creating sandbox from custom image: ${options.image}`);
            // Create from custom image
            const params: CreateSandboxFromImageParams = {
              image: Image.custom(options.image),
              labels: {
                vaporform_project_id: workspace.project_id.toString(),
                vaporform_workspace_id: workspaceId.toString(),
                project_name: workspace.name,
              },
              autoStopInterval: options.autoStopInterval || 15,
              autoArchiveInterval: options.autoArchiveInterval || 7 * 24 * 60,
              ephemeral: options.ephemeral || false,
            };

            if (options.resources) {
              params.resources = new Resources(
                options.resources.cpu,
                options.resources.memory,
                options.resources.disk
              );
            }

            if (options.environment) {
              params.envVars = options.environment;
            }

            console.log(`[DAYTONA DEBUG] Calling daytona.create() with image params:`, JSON.stringify(params, null, 2));
            sandbox = await this.daytona.create(params);
            console.log(`[DAYTONA DEBUG] ✓ Daytona sandbox created with ID: ${sandbox.id}`);
          } else {
            // Create from language snapshot (default)
            const rawLanguage = options?.language || workspace.language || 'typescript';
            const language = this.normalizeDaytonaLanguage(rawLanguage);
            console.log(`[DAYTONA DEBUG] Creating sandbox from language snapshot: ${language}`);

            const params: CreateSandboxFromSnapshotParams = {
              language: language,
              labels: {
                vaporform_project_id: workspace.project_id.toString(),
                vaporform_workspace_id: workspaceId.toString(),
                project_name: workspace.name,
              },
              autoStopInterval: options?.autoStopInterval || workspace.auto_stop_interval || 15,
              autoArchiveInterval: options?.autoArchiveInterval || workspace.auto_archive_interval || 7 * 24 * 60,
              ephemeral: options?.ephemeral || workspace.ephemeral || false,
            };

            if (options?.resources) {
              params.resources = new Resources(
                options.resources.cpu,
                options.resources.memory,
                options.resources.disk
              );
              console.log(`[DAYTONA DEBUG] Using custom resources:`, options.resources);
            }

            if (options?.environment) {
              params.envVars = options.environment;
              console.log(`[DAYTONA DEBUG] Using environment variables:`, Object.keys(options.environment));
            }

            console.log(`[DAYTONA DEBUG] Calling daytona.create() with snapshot params:`, JSON.stringify(params, null, 2));
            sandbox = await this.daytona.create(params);
            console.log(`[DAYTONA DEBUG] ✓ Daytona sandbox created with ID: ${sandbox.id}`);
          }

          // Wait for sandbox to be fully running
          console.log(`[DAYTONA DEBUG] Sandbox ${sandbox.id} created, updating database...`);
          console.log(`✓ Daytona sandbox ${sandbox.id} created, waiting for running state...`);

          // Update workspace with Daytona sandbox ID
          await db.exec`
            UPDATE workspaces
            SET
              status = 'running',
              daytona_sandbox_id = ${sandbox.id},
              started_at = NOW(),
              updated_at = NOW()
            WHERE id = ${workspaceId}
          `;
          console.log(`[DAYTONA DEBUG] ✓ Database updated with sandbox ID ${sandbox.id}`);

          await this.addLog(workspaceId, 'info', `Sandbox ${sandbox.id} started successfully`);
          console.log(`✓ Workspace ${workspaceId} (Sandbox ${sandbox.id}) is running`);
        } catch (daytonaError) {
          console.error(`[DAYTONA DEBUG] ✗ Daytona API error for workspace ${workspaceId}:`, daytonaError);
          console.error(`[DAYTONA DEBUG] Error details:`, {
            name: daytonaError instanceof Error ? daytonaError.name : 'Unknown',
            message: daytonaError instanceof Error ? daytonaError.message : String(daytonaError),
            stack: daytonaError instanceof Error ? daytonaError.stack : undefined
          });
          throw daytonaError;
        }
      } else {
        // No Daytona SDK - development mode
        const mockSandboxId = `dev-sandbox-${workspaceId}-${Date.now()}`;
        await db.exec`
          UPDATE workspaces
          SET
            status = 'running',
            daytona_sandbox_id = ${mockSandboxId},
            started_at = NOW(),
            updated_at = NOW()
          WHERE id = ${workspaceId}
        `;

        await this.addLog(workspaceId, 'info', 'Workspace started (development mode - no Daytona SDK)');
        console.log(`✓ Workspace ${workspaceId} started in development mode`);
      }
    } catch (error) {
      console.error(`Error starting workspace ${workspaceId}:`, error);

      await db.exec`
        UPDATE workspaces
        SET
          status = 'error',
          error_message = ${error instanceof Error ? error.message : 'Unknown error'},
          updated_at = NOW()
        WHERE id = ${workspaceId}
      `;

      await this.addLog(
        workspaceId,
        'error',
        `Failed to start workspace: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get workspace by ID
   */
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

  /**
   * Get workspace for a project
   */
  async getProjectWorkspace(projectId: bigint): Promise<Workspace | null> {
    console.log(`[DAYTONA DEBUG] getProjectWorkspace called for project ${projectId}`);

    const workspace = await db.queryRow<Workspace>`
      SELECT * FROM workspaces
      WHERE project_id = ${projectId}
      AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `;

    if (workspace) {
      console.log(`[DAYTONA DEBUG] Found workspace ${workspace.id} for project ${projectId}`);
      console.log(`[DAYTONA DEBUG] Workspace status: ${workspace.status}`);
      console.log(`[DAYTONA DEBUG] Daytona sandbox ID: ${workspace.daytona_sandbox_id || 'NONE'}`);

      // Check if this is a mock sandbox (created before API key was added)
      if (workspace.daytona_sandbox_id && workspace.daytona_sandbox_id.startsWith('dev-sandbox-')) {
        console.log(`[DAYTONA DEBUG] ⚠️ WARNING: This appears to be a MOCK sandbox (starts with 'dev-sandbox-')`);
      }
    } else {
      console.log(`[DAYTONA DEBUG] No workspace found for project ${projectId}`);
    }

    return workspace || null;
  }

  /**
   * Get Daytona sandbox instance
   */
  private async getSandbox(workspace: Workspace) {
    if (!this.daytona) {
      throw new Error('Daytona SDK not initialized');
    }

    if (!workspace.daytona_sandbox_id) {
      throw new Error('Workspace does not have a Daytona sandbox ID');
    }

    return await this.daytona.get(workspace.daytona_sandbox_id);
  }

  /**
   * Stop a workspace (Stop Daytona Sandbox)
   */
  async stopWorkspace(workspaceId: bigint): Promise<void> {
    const workspace = await this.getWorkspace(workspaceId);

    if (workspace.status === 'stopped') {
      return; // Already stopped
    }

    try {
      if (this.daytona && workspace.daytona_sandbox_id) {
        const sandbox = await this.getSandbox(workspace);
        await sandbox.stop();
        console.log(`✓ Stopped Daytona sandbox ${workspace.daytona_sandbox_id}`);
      }

      await db.exec`
        UPDATE workspaces
        SET status = 'stopped', stopped_at = NOW(), updated_at = NOW()
        WHERE id = ${workspaceId}
      `;

      await this.addLog(workspaceId, 'info', 'Workspace stopped');
      console.log(`✓ Stopped workspace ${workspaceId}`);
    } catch (error) {
      console.error(`Error stopping workspace ${workspaceId}:`, error);
      throw error;
    }
  }

  /**
   * Restart a workspace (Start a stopped Daytona Sandbox)
   */
  async restartWorkspace(workspaceId: bigint): Promise<void> {
    console.log(`[DAYTONA DEBUG] restartWorkspace called for workspace ${workspaceId}`);

    const workspace = await this.getWorkspace(workspaceId);
    console.log(`[DAYTONA DEBUG] Workspace ${workspaceId} current status: ${workspace.status}`);
    console.log(`[DAYTONA DEBUG] Workspace sandbox ID: ${workspace.daytona_sandbox_id || 'NONE'}`);

    if (workspace.status === 'running') {
      console.log(`[DAYTONA DEBUG] Workspace ${workspaceId} is already running, no action needed`);
      return;
    }

    // Check if this is a mock sandbox
    if (workspace.daytona_sandbox_id && workspace.daytona_sandbox_id.startsWith('dev-sandbox-')) {
      console.log(`[DAYTONA DEBUG] ⚠️ Cannot restart mock sandbox - this workspace was created before API key was configured`);
      console.log(`[DAYTONA DEBUG] Mock sandbox ID: ${workspace.daytona_sandbox_id}`);
      // We should create a real sandbox instead of trying to restart the mock one
      console.log(`[DAYTONA DEBUG] Attempting to create real sandbox by calling startWorkspace...`);
      await this.startWorkspace(workspaceId);
      return;
    }

    try {
      if (this.daytona && workspace.daytona_sandbox_id) {
        console.log(`[DAYTONA DEBUG] Calling Daytona SDK to restart sandbox ${workspace.daytona_sandbox_id}`);
        const sandbox = await this.getSandbox(workspace);
        await sandbox.start();
        console.log(`[DAYTONA DEBUG] ✓ Daytona sandbox ${workspace.daytona_sandbox_id} restarted`);
        console.log(`✓ Started Daytona sandbox ${workspace.daytona_sandbox_id}`);
      }

      await db.exec`
        UPDATE workspaces
        SET status = 'running', started_at = NOW(), updated_at = NOW()
        WHERE id = ${workspaceId}
      `;
      console.log(`[DAYTONA DEBUG] ✓ Updated workspace ${workspaceId} status to 'running'`);

      await this.addLog(workspaceId, 'info', 'Workspace restarted');
      console.log(`✓ Restarted workspace ${workspaceId}`);
    } catch (error) {
      console.error(`[DAYTONA DEBUG] ✗ Error restarting workspace ${workspaceId}:`, error);
      console.error(`Error restarting workspace ${workspaceId}:`, error);

      await db.exec`
        UPDATE workspaces
        SET status = 'error', error_message = ${error instanceof Error ? error.message : 'Unknown error'}, updated_at = NOW()
        WHERE id = ${workspaceId}
      `;

      await this.addLog(workspaceId, 'error', `Failed to restart: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  /**
   * Delete a workspace (Delete Daytona Sandbox)
   */
  async deleteWorkspace(workspaceId: bigint): Promise<void> {
    const workspace = await this.getWorkspace(workspaceId);

    try {
      // Stop if running
      if (workspace.status === 'running') {
        await this.stopWorkspace(workspaceId);
      }

      // Delete Daytona sandbox
      if (this.daytona && workspace.daytona_sandbox_id) {
        const sandbox = await this.getSandbox(workspace);
        await sandbox.delete();
        console.log(`✓ Deleted Daytona sandbox ${workspace.daytona_sandbox_id}`);
      }

      await db.exec`
        UPDATE workspaces
        SET status = 'deleted', deleted_at = NOW(), updated_at = NOW()
        WHERE id = ${workspaceId}
      `;

      await this.addLog(workspaceId, 'info', 'Workspace deleted');
      console.log(`✓ Deleted workspace ${workspaceId}`);
    } catch (error) {
      console.error(`Error deleting workspace ${workspaceId}:`, error);
      throw error;
    }
  }

  /**
   * Execute command in workspace (using Daytona process API)
   */
  async executeCommand(
    workspaceId: bigint,
    command: string
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const workspace = await this.getWorkspace(workspaceId);

    if (workspace.status !== 'running') {
      throw new ValidationError('Workspace is not running');
    }

    try {
      if (this.daytona && workspace.daytona_sandbox_id) {
        const sandbox = await this.getSandbox(workspace);

        // Execute command using Daytona process API
        const result = await sandbox.process.executeCommand(command);

        await this.addLog(workspaceId, 'info', `Executed command: ${command}`);

        return {
          stdout: result.stdout || '',
          stderr: result.stderr || '',
          exitCode: result.exitCode || 0,
        };
      } else {
        // Development mode
        await this.addLog(workspaceId, 'info', `[DEV MODE] Simulated command: ${command}`);
        return {
          stdout: `[Development Mode] Command executed: ${command}`,
          stderr: '',
          exitCode: 0,
        };
      }
    } catch (error) {
      console.error(`Error executing command in workspace ${workspaceId}:`, error);
      throw error;
    }
  }

  /**
   * Write file to workspace (using Daytona filesystem API)
   */
  async writeFile(
    workspaceId: bigint,
    path: string,
    content: string
  ): Promise<void> {
    const workspace = await this.getWorkspace(workspaceId);

    if (workspace.status !== 'running') {
      throw new ValidationError('Workspace is not running');
    }

    try {
      if (this.daytona && workspace.daytona_sandbox_id) {
        const sandbox = await this.getSandbox(workspace);
        await sandbox.filesystem.writeFile(path, content);
        await this.addLog(workspaceId, 'info', `Wrote file: ${path}`);
        console.log(`✓ Wrote file ${path} to workspace ${workspaceId}`);
      }
    } catch (error) {
      console.error(`Error writing file in workspace ${workspaceId}:`, error);
      throw error;
    }
  }

  /**
   * Read file from workspace (using Daytona filesystem API)
   */
  async readFile(workspaceId: bigint, path: string): Promise<string> {
    const workspace = await this.getWorkspace(workspaceId);

    if (workspace.status !== 'running') {
      throw new ValidationError('Workspace is not running');
    }

    try {
      if (this.daytona && workspace.daytona_sandbox_id) {
        const sandbox = await this.getSandbox(workspace);
        const content = await sandbox.filesystem.readFile(path);
        await this.addLog(workspaceId, 'info', `Read file: ${path}`);
        return content;
      } else {
        throw new Error('Daytona SDK not available');
      }
    } catch (error) {
      console.error(`Error reading file in workspace ${workspaceId}:`, error);
      throw error;
    }
  }

  /**
   * Get sandbox URL for preview
   */
  async getSandboxUrl(workspaceId: bigint): Promise<string | null> {
    const workspace = await this.getWorkspace(workspaceId);

    if (!workspace.daytona_sandbox_id || !this.daytona) {
      return null;
    }

    try {
      const sandbox = await this.getSandbox(workspace);
      // Get the sandbox preview URL or workspace URL
      // This depends on Daytona's specific implementation
      return `https://app.daytona.io/sandbox/${sandbox.id}`;
    } catch (error) {
      console.error(`Error getting sandbox URL for workspace ${workspaceId}:`, error);
      return null;
    }
  }

  /**
   * Get preview URL for running application in sandbox
   * Detects the port based on command or uses default port 3000
   */
  async getPreviewUrl(
    workspaceId: bigint,
    port?: number
  ): Promise<{ url: string; port: number } | null> {
    const workspace = await this.getWorkspace(workspaceId);

    if (!workspace.daytona_sandbox_id || !this.daytona) {
      console.log(`[DAYTONA] Cannot get preview URL - no sandbox ID or Daytona SDK`);
      return null;
    }

    if (workspace.status !== 'running') {
      console.log(`[DAYTONA] Cannot get preview URL - workspace is not running (status: ${workspace.status})`);
      return null;
    }

    try {
      const sandbox = await this.getSandbox(workspace);

      // Default to port 3000 if not specified
      const previewPort = port || 3000;

      console.log(`[DAYTONA] Getting preview link for sandbox ${sandbox.id} on port ${previewPort}`);

      // Get preview link from Daytona API
      const previewLink = await sandbox.getPreviewLink(previewPort);

      console.log(`[DAYTONA] ✓ Got preview URL: ${previewLink.url}`);

      return {
        url: previewLink.url,
        port: previewPort
      };
    } catch (error) {
      console.error(`[DAYTONA] Error getting preview URL for workspace ${workspaceId}:`, error);
      return null;
    }
  }

  /**
   * Detect port from command string
   * Returns the most likely port based on the command
   */
  detectPortFromCommand(command: string): number {
    const cmd = command.toLowerCase();

    // Check for explicit port in command
    const portMatch = cmd.match(/--port[=\s]+(\d+)|port[=\s]+(\d+)|-p\s+(\d+)/);
    if (portMatch) {
      const port = parseInt(portMatch[1] || portMatch[2] || portMatch[3]);
      if (port > 0 && port < 65536) {
        console.log(`[DAYTONA] Detected port ${port} from command`);
        return port;
      }
    }

    // Default ports for common frameworks
    if (cmd.includes('vite')) return 5173;
    if (cmd.includes('vue-cli-service')) return 8080;
    if (cmd.includes('ng serve')) return 4200;
    if (cmd.includes('next')) return 3000;

    // Default to 3000 for most Node.js apps
    console.log(`[DAYTONA] Using default port 3000`);
    return 3000;
  }

  /**
   * Parse port from command output
   * Looks for common patterns like "running on port 3000" or "localhost:3000"
   */
  private parsePortFromOutput(output: string): number | null {
    // Common patterns in dev server output
    const patterns = [
      /(?:port|PORT)\s*[:\s]+(\d+)/i,
      /localhost:(\d+)/i,
      /0\.0\.0\.0:(\d+)/i,
      /127\.0\.0\.1:(\d+)/i,
      /http:\/\/[^:]+:(\d+)/i,
    ];

    for (const pattern of patterns) {
      const match = output.match(pattern);
      if (match) {
        const port = parseInt(match[1]);
        if (port > 0 && port < 65536) {
          console.log(`[DAYTONA] Parsed port ${port} from output`);
          return port;
        }
      }
    }

    return null;
  }

  /**
   * Infer dev command from package.json if available
   */
  async inferDevCommand(workspaceId: bigint): Promise<string | null> {
    try {
      console.log(`[DAYTONA] Attempting to infer dev command from package.json`);

      // Try to read package.json
      const packageJson = await this.readFile(workspaceId, 'package.json');
      const pkg = JSON.parse(packageJson);

      // Check for common dev scripts in order of preference
      const scripts = pkg.scripts || {};
      const devScripts = ['dev', 'start:dev', 'start', 'serve'];

      for (const scriptName of devScripts) {
        if (scripts[scriptName]) {
          const command = `npm run ${scriptName}`;
          console.log(`[DAYTONA] ✓ Inferred dev command: ${command}`);
          return command;
        }
      }

      console.log(`[DAYTONA] No dev script found in package.json`);
      return null;
    } catch (error) {
      console.log(`[DAYTONA] Could not infer dev command:`, error);
      return null;
    }
  }

  /**
   * Validate command syntax before execution
   */
  private validateCommand(command: string): { valid: boolean; error?: string } {
    // Check for common issues
    if (command.includes('\\') && !command.includes('\\\\')) {
      return { valid: false, error: 'Invalid path separators (use forward slashes on Linux)' };
    }

    if (command.match(/^cd\s+/)) {
      return { valid: false, error: 'cd commands not supported in PTY. Use absolute paths instead.' };
    }

    // Check for unmatched quotes
    const quoteCount = (command.match(/"/g) || []).length;
    if (quoteCount % 2 !== 0) {
      return { valid: false, error: 'Unmatched quotes in command' };
    }

    return { valid: true };
  }

  /**
   * Timeout wrapper for promises
   */
  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    operation: string
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`${operation} timed out after ${timeoutMs}ms`)), timeoutMs)
      )
    ]);
  }

  /**
   * Check if port is available in workspace
   */
  private async isPortAvailable(workspaceId: bigint, port: number): Promise<boolean> {
    try {
      const result = await this.executeCommand(workspaceId, `lsof -i :${port} 2>&1 || echo "FREE"`);
      return result.stdout.includes('FREE');
    } catch (error) {
      console.log(`[DAYTONA] Could not check port ${port} availability:`, error);
      return true; // Assume available if check fails
    }
  }

  /**
   * Start dev server in background and return immediately
   * The server continues running in the sandbox
   */
  async startDevServer(
    workspaceId: bigint,
    command: string
  ): Promise<{ processStarted: boolean; detectedPort?: number }> {
    // Validate workspace is still running
    const workspace = await this.getWorkspace(workspaceId);
    if (workspace.status !== 'running') {
      throw new ValidationError('Workspace is not running');
    }

    // Validate command syntax
    const validation = this.validateCommand(command);
    if (!validation.valid) {
      throw new ValidationError(`Invalid command syntax: ${validation.error}`);
    }

    // Check for port conflicts
    const expectedPort = this.detectPortFromCommand(command);
    const portAvailable = await this.isPortAvailable(workspaceId, expectedPort);
    if (!portAvailable) {
      console.log(`[DAYTONA] Warning: Port ${expectedPort} is already in use`);
      await this.addLog(workspaceId, 'warn', `Port ${expectedPort} is already in use. Server may fail to start.`);
    }

    let pty: any = null;

    try {
      if (this.daytona && workspace.daytona_sandbox_id) {
        const sandbox = await this.getSandbox(workspace);

        console.log(`[DAYTONA] Starting dev server in background: ${command}`);

        // Try to create PTY with timeout and fallback
        try {
          pty = await this.withTimeout(
            sandbox.process.createPty(),
            10000,
            'PTY creation'
          );

          // Write the command to the PTY
          await this.withTimeout(
            pty.write(`${command}\n`),
            5000,
            'PTY write'
          );

          console.log(`[DAYTONA] ✓ Dev server command sent to PTY`);

          // Wait a moment for initial output
          await new Promise(resolve => setTimeout(resolve, 2000));

          // Try to read initial output to detect port
          let detectedPort: number | undefined;
          try {
            const output = await this.withTimeout(
              pty.read(),
              3000,
              'PTY read'
            );
            const parsedPort = this.parsePortFromOutput(output);
            if (parsedPort) {
              detectedPort = parsedPort;
            }
          } catch (readError) {
            console.log(`[DAYTONA] Could not read initial output from PTY:`, readError);
          }

          await this.addLog(workspaceId, 'info', `Dev server started: ${command}`);

          return {
            processStarted: true,
            detectedPort
          };

        } catch (ptyError) {
          console.error(`[DAYTONA] PTY creation/usage failed:`, ptyError);

          // Clean up PTY if it was created
          if (pty) {
            try {
              await pty.close();
              console.log(`[DAYTONA] ✓ Cleaned up PTY after error`);
            } catch (closeError) {
              console.error(`[DAYTONA] Failed to close PTY:`, closeError);
            }
          }

          // Fallback to regular command execution
          console.log(`[DAYTONA] Falling back to executeCommand for dev server`);
          await this.addLog(workspaceId, 'warn', 'PTY unavailable, using standard command execution');

          try {
            // Execute command in background using nohup
            const bgCommand = `nohup ${command} > /tmp/dev-server.log 2>&1 &`;
            const result = await this.executeCommand(workspaceId, bgCommand);

            console.log(`[DAYTONA] ✓ Dev server started via background command`);
            await this.addLog(workspaceId, 'info', `Dev server started (fallback method): ${command}`);

            return {
              processStarted: true,
              detectedPort: expectedPort
            };
          } catch (fallbackError) {
            console.error(`[DAYTONA] Fallback command execution also failed:`, fallbackError);
            throw new Error(`Failed to start dev server: PTY and fallback both failed`);
          }
        }
      } else {
        // Development mode
        console.log(`[DAYTONA] [DEV MODE] Simulated dev server start: ${command}`);
        await this.addLog(workspaceId, 'info', `[DEV MODE] Dev server started: ${command}`);

        return {
          processStarted: true,
          detectedPort: this.detectPortFromCommand(command)
        };
      }
    } catch (error) {
      // Clean up PTY on any error
      if (pty) {
        try {
          await pty.close();
          console.log(`[DAYTONA] ✓ Cleaned up PTY after error`);
        } catch (closeError) {
          console.error(`[DAYTONA] Failed to close PTY:`, closeError);
        }
      }

      console.error(`[DAYTONA] Error starting dev server in workspace ${workspaceId}:`, error);
      await this.addLog(workspaceId, 'error', `Dev server start failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  /**
   * Health check a preview URL to verify the server is responding
   * Returns true if server responds with 2xx or 3xx status
   */
  async healthCheckPreviewUrl(url: string, maxAttempts: number = 5): Promise<boolean> {
    console.log(`[DAYTONA] Health checking preview URL: ${url}`);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(`[DAYTONA] Health check attempt ${attempt}/${maxAttempts}`);

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000); // 5 second timeout

        const response = await fetch(url, {
          method: 'GET',
          signal: controller.signal,
          headers: {
            'User-Agent': 'Vaporform-HealthCheck/1.0'
          }
        });

        clearTimeout(timeout);

        // Accept 2xx and 3xx status codes as healthy
        if (response.status >= 200 && response.status < 400) {
          console.log(`[DAYTONA] ✓ Health check passed (status: ${response.status})`);
          return true;
        } else {
          console.log(`[DAYTONA] Health check returned status ${response.status}`);
        }
      } catch (error) {
        console.log(`[DAYTONA] Health check attempt ${attempt} failed:`, error instanceof Error ? error.message : 'Unknown error');
      }

      // Wait before next attempt (exponential backoff)
      if (attempt < maxAttempts) {
        const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        console.log(`[DAYTONA] Waiting ${waitTime}ms before next attempt...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    console.log(`[DAYTONA] ✗ Health check failed after ${maxAttempts} attempts`);
    return false;
  }

  /**
   * Build project in workspace
   */
  async buildProject(projectId: bigint, workspaceId?: bigint): Promise<Build> {
    // Create build record
    const build = await db.queryRow<Build>`
      INSERT INTO builds (project_id, workspace_id, status, started_at)
      VALUES (${projectId}, ${workspaceId || null}, 'building', NOW())
      RETURNING *
    `;

    if (!build) {
      throw new Error('Failed to create build');
    }

    // Run build in background
    this.runBuild(build.id, projectId, workspaceId).catch(err => {
      console.error(`Build ${build.id} failed:`, err);
    });

    return build;
  }

  /**
   * Run build process using Daytona sandbox
   */
  private async runBuild(buildId: bigint, projectId: bigint, workspaceId?: bigint): Promise<void> {
    const startTime = Date.now();
    let logs = '';

    try {
      logs += 'Starting build...\n';

      // Get or create workspace
      let workspace: Workspace | null = null;
      if (workspaceId) {
        workspace = await this.getWorkspace(workspaceId);
      } else {
        workspace = await this.getProjectWorkspace(projectId);
        if (!workspace) {
          // Create temporary workspace for build
          workspace = await this.createWorkspace(projectId, `build-${buildId}`, {
            language: 'typescript',
            ephemeral: true,
            autoStopInterval: 30, // Auto-stop after 30 minutes
          });
          // Wait for workspace to start
          await new Promise(resolve => setTimeout(resolve, 3000));
          workspace = await this.getWorkspace(workspace.id);
        }
      }

      logs += `Using workspace: ${workspace.id}\n`;

      if (this.daytona && workspace.daytona_sandbox_id && workspace.status === 'running') {
        const sandbox = await this.getSandbox(workspace);

        // Install dependencies
        logs += 'Installing dependencies...\n';
        const installResult = await sandbox.process.executeCommand('npm install');
        logs += installResult.stdout || '';
        if (installResult.exitCode !== 0) {
          throw new Error(`Dependency installation failed: ${installResult.stderr}`);
        }

        // Run build
        logs += 'Running build...\n';
        const buildResult = await sandbox.process.executeCommand('npm run build');
        logs += buildResult.stdout || '';
        if (buildResult.exitCode !== 0) {
          throw new Error(`Build failed: ${buildResult.stderr}`);
        }

        logs += 'Build completed successfully\n';
      } else {
        // Simulated build
        await new Promise(resolve => setTimeout(resolve, 5000));
        logs += '[DEV MODE] Build simulated successfully\n';
      }

      const duration = Date.now() - startTime;

      await db.exec`
        UPDATE builds
        SET
          status = 'success',
          build_logs = ${logs},
          duration_ms = ${duration},
          completed_at = NOW()
        WHERE id = ${buildId}
      `;

      console.log(`✓ Build ${buildId} completed in ${duration}ms`);
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      logs += `\nBuild failed: ${errorMessage}\n`;

      await db.exec`
        UPDATE builds
        SET
          status = 'failed',
          build_logs = ${logs},
          error_message = ${errorMessage},
          duration_ms = ${duration},
          completed_at = NOW()
        WHERE id = ${buildId}
      `;

      console.error(`✗ Build ${buildId} failed:`, errorMessage);
    }
  }

  /**
   * Get build by ID
   */
  async getBuild(buildId: bigint): Promise<Build> {
    const build = await db.queryRow<Build>`
      SELECT * FROM builds WHERE id = ${buildId}
    `;

    if (!build) {
      throw new NotFoundError(`Build not found: ${buildId}`);
    }

    return build;
  }

  /**
   * List builds for a project
   */
  async listBuilds(projectId: bigint, limit: number = 20): Promise<Build[]> {
    const builds: Build[] = [];

    for await (const build of db.query<Build>`
      SELECT * FROM builds
      WHERE project_id = ${projectId}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `) {
      builds.push(build);
    }

    return builds;
  }

  /**
   * Deploy all files from VFS to Daytona sandbox
   * This is the new VFS-first architecture - files are stored in VFS, then deployed to sandbox
   */
  async deployProjectFromVFS(
    workspaceId: bigint,
    projectId: bigint,
    paths?: string[]
  ): Promise<{ filesDeployed: number }> {
    console.log(`[DAYTONA] Deploying project ${projectId} from VFS to workspace ${workspaceId}`);

    const workspace = await this.getWorkspace(workspaceId);
    if (workspace.status !== 'running') {
      throw new ValidationError('Workspace is not running');
    }

    // Get all file paths from VFS (or specific paths if provided)
    const { gridfs } = await import('../vfs/gridfs.js');
    let filePaths: string[];

    if (paths) {
      filePaths = paths;
    } else {
      // Get all files from VFS for this project
      const files = await db.query<{ path: string }>`
        SELECT path FROM file_metadata
        WHERE project_id = ${projectId}
        AND is_directory = false
        AND deleted_at IS NULL
        ORDER BY path ASC
      `;

      filePaths = [];
      for await (const file of files) {
        filePaths.push(file.path);
      }
    }

    console.log(`[DAYTONA] Found ${filePaths.length} files to deploy`);

    let filesDeployed = 0;

    for (const path of filePaths) {
      try {
        // Read file from VFS
        const content = await gridfs.readFile(projectId, path);

        // Write to Daytona sandbox
        await this.writeFile(workspaceId, path, content.toString('utf-8'));

        filesDeployed++;

        if (filesDeployed % 10 === 0) {
          console.log(`[DAYTONA] Deployed ${filesDeployed}/${filePaths.length} files...`);
        }
      } catch (error) {
        console.error(`[DAYTONA] Failed to deploy ${path}:`, error);
        throw new Error(`Failed to deploy file ${path}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    console.log(`[DAYTONA] ✓ Deployed ${filesDeployed} files from VFS to workspace ${workspaceId}`);
    await this.addLog(workspaceId, 'info', `Deployed ${filesDeployed} files from VFS`);

    return { filesDeployed };
  }

  /**
   * Detect technology stack from VFS files
   * Returns information about the language, framework, and package manager
   */
  async detectTechStack(workspaceId: bigint, projectId: bigint): Promise<import('../shared/types.js').TechStack> {
    console.log(`[DAYTONA] Detecting tech stack for project ${projectId}`);

    const { gridfs } = await import('../vfs/gridfs.js');

    // Get all file paths from VFS
    const files = await db.query<{ path: string }>`
      SELECT path FROM file_metadata
      WHERE project_id = ${projectId}
      AND deleted_at IS NULL
    `;

    const filePaths: string[] = [];
    for await (const file of files) {
      filePaths.push(file.path);
    }

    const detections = {
      hasPackageJson: filePaths.includes('/package.json'),
      hasRequirementsTxt: filePaths.includes('/requirements.txt'),
      hasPyprojectToml: filePaths.includes('/pyproject.toml'),
      hasCargoToml: filePaths.includes('/Cargo.toml'),
      hasGoMod: filePaths.includes('/go.mod'),
      hasPomXml: filePaths.includes('/pom.xml'),
      hasBuildGradle: filePaths.includes('/build.gradle'),
      hasComposerJson: filePaths.includes('/composer.json'),
      hasGemfile: filePaths.includes('/Gemfile')
    };

    // Detect Node.js projects
    if (detections.hasPackageJson) {
      try {
        const pkgJsonBuffer = await gridfs.readFile(projectId, '/package.json');
        const pkg = JSON.parse(pkgJsonBuffer.toString());

        const deps = { ...pkg.dependencies, ...pkg.devDependencies };

        // Detect framework
        if (deps.next) {
          console.log(`[DAYTONA] ✓ Detected: Node.js / Next.js / npm`);
          return { language: 'nodejs', framework: 'nextjs', packageManager: 'npm' };
        }
        if (deps.react) {
          console.log(`[DAYTONA] ✓ Detected: Node.js / React / npm`);
          return { language: 'nodejs', framework: 'react', packageManager: 'npm' };
        }
        if (deps.vue) {
          console.log(`[DAYTONA] ✓ Detected: Node.js / Vue / npm`);
          return { language: 'nodejs', framework: 'vue', packageManager: 'npm' };
        }
        if (deps['@angular/core']) {
          console.log(`[DAYTONA] ✓ Detected: Node.js / Angular / npm`);
          return { language: 'nodejs', framework: 'angular', packageManager: 'npm' };
        }
        if (deps.svelte) {
          console.log(`[DAYTONA] ✓ Detected: Node.js / Svelte / npm`);
          return { language: 'nodejs', framework: 'svelte', packageManager: 'npm' };
        }
        if (deps.express) {
          console.log(`[DAYTONA] ✓ Detected: Node.js / Express / npm`);
          return { language: 'nodejs', framework: 'express', packageManager: 'npm' };
        }
        if (deps['@nestjs/core']) {
          console.log(`[DAYTONA] ✓ Detected: Node.js / NestJS / npm`);
          return { language: 'nodejs', framework: 'nestjs', packageManager: 'npm' };
        }

        console.log(`[DAYTONA] ✓ Detected: Node.js / Generic / npm`);
        return { language: 'nodejs', framework: 'generic', packageManager: 'npm' };
      } catch (error) {
        console.warn(`[DAYTONA] Could not parse package.json:`, error);
      }
    }

    // Detect Python projects
    if (detections.hasRequirementsTxt || detections.hasPyprojectToml) {
      try {
        let content = '';
        if (detections.hasRequirementsTxt) {
          const buffer = await gridfs.readFile(projectId, '/requirements.txt');
          content = buffer.toString().toLowerCase();
        }

        if (content.includes('django')) {
          console.log(`[DAYTONA] ✓ Detected: Python / Django / pip`);
          return { language: 'python', framework: 'django', packageManager: 'pip' };
        }
        if (content.includes('flask')) {
          console.log(`[DAYTONA] ✓ Detected: Python / Flask / pip`);
          return { language: 'python', framework: 'flask', packageManager: 'pip' };
        }
        if (content.includes('fastapi')) {
          console.log(`[DAYTONA] ✓ Detected: Python / FastAPI / pip`);
          return { language: 'python', framework: 'fastapi', packageManager: 'pip' };
        }

        console.log(`[DAYTONA] ✓ Detected: Python / Generic / pip`);
        return { language: 'python', framework: 'generic', packageManager: 'pip' };
      } catch (error) {
        console.warn(`[DAYTONA] Could not read Python dependency files:`, error);
        return { language: 'python', framework: 'generic', packageManager: 'pip' };
      }
    }

    // Detect Rust projects
    if (detections.hasCargoToml) {
      console.log(`[DAYTONA] ✓ Detected: Rust / Generic / cargo`);
      return { language: 'rust', framework: 'generic', packageManager: 'cargo' };
    }

    // Detect Go projects
    if (detections.hasGoMod) {
      console.log(`[DAYTONA] ✓ Detected: Go / Generic / go`);
      return { language: 'go', framework: 'generic', packageManager: 'go' };
    }

    // Detect Java projects
    if (detections.hasPomXml) {
      console.log(`[DAYTONA] ✓ Detected: Java / Maven / maven`);
      return { language: 'java', framework: 'maven', packageManager: 'maven' };
    }
    if (detections.hasBuildGradle) {
      console.log(`[DAYTONA] ✓ Detected: Java / Gradle / gradle`);
      return { language: 'java', framework: 'gradle', packageManager: 'gradle' };
    }

    // Detect PHP projects
    if (detections.hasComposerJson) {
      console.log(`[DAYTONA] ✓ Detected: PHP / Generic / composer`);
      return { language: 'php', framework: 'generic', packageManager: 'composer' };
    }

    // Detect Ruby projects
    if (detections.hasGemfile) {
      console.log(`[DAYTONA] ✓ Detected: Ruby / Generic / bundler`);
      return { language: 'ruby', framework: 'generic', packageManager: 'bundler' };
    }

    console.log(`[DAYTONA] ⚠ Could not detect tech stack, defaulting to Node.js`);
    return { language: 'unknown', framework: 'generic', packageManager: 'none' };
  }

  /**
   * Install dependencies based on detected tech stack
   */
  async installDependencies(
    workspaceId: bigint,
    techStack: import('../shared/types.js').TechStack
  ): Promise<{ success: boolean; output: string }> {
    console.log(`[DAYTONA] Installing dependencies with ${techStack.packageManager}`);

    const commands: Record<string, string> = {
      npm: 'npm install',
      yarn: 'yarn install',
      pnpm: 'pnpm install',
      pip: 'pip install -r requirements.txt',
      poetry: 'poetry install',
      cargo: 'cargo fetch',
      go: 'go mod download',
      maven: 'mvn install -DskipTests',
      gradle: './gradlew build -x test',
      composer: 'composer install',
      bundler: 'bundle install',
      none: ''
    };

    const command = commands[techStack.packageManager];

    if (!command) {
      console.log(`[DAYTONA] No dependency installation needed for ${techStack.packageManager}`);
      return { success: true, output: 'No dependencies to install' };
    }

    try {
      console.log(`[DAYTONA] Running: ${command}`);
      await this.addLog(workspaceId, 'info', `Installing dependencies: ${command}`);

      const result = await this.executeCommand(workspaceId, command);

      if (result.exitCode !== 0) {
        console.error(`[DAYTONA] ✗ Dependency installation failed (exit code ${result.exitCode})`);
        console.error(`[DAYTONA] stderr:`, result.stderr);
        await this.addLog(workspaceId, 'error', `Dependency installation failed: ${result.stderr}`);
        return { success: false, output: result.stderr };
      }

      console.log(`[DAYTONA] ✓ Dependencies installed successfully`);
      await this.addLog(workspaceId, 'info', 'Dependencies installed successfully');

      return { success: true, output: result.stdout };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[DAYTONA] ✗ Error installing dependencies:`, errorMsg);
      await this.addLog(workspaceId, 'error', `Error installing dependencies: ${errorMsg}`);
      return { success: false, output: errorMsg };
    }
  }

  /**
   * Build project based on detected tech stack and framework
   * This is optional for dev mode but required for production
   */
  async buildProjectWithTechStack(
    workspaceId: bigint,
    techStack: import('../shared/types.js').TechStack
  ): Promise<{ success: boolean; output: string }> {
    console.log(`[DAYTONA] Building project with framework: ${techStack.framework}`);

    const buildCommands: Record<string, string> = {
      // Node.js frameworks
      nextjs: 'npm run build',
      react: 'npm run build',
      vue: 'npm run build',
      angular: 'npm run build',
      svelte: 'npm run build',
      express: '', // Express doesn't need build
      nestjs: 'npm run build',
      // Python frameworks
      django: 'python manage.py collectstatic --noinput',
      flask: '', // Flask doesn't need build
      fastapi: '', // FastAPI doesn't need build
      // Other
      maven: 'mvn package -DskipTests',
      gradle: './gradlew build -x test',
      generic: ''
    };

    const command = buildCommands[techStack.framework];

    if (!command) {
      console.log(`[DAYTONA] No build step needed for ${techStack.framework}`);
      return { success: true, output: 'No build needed' };
    }

    try {
      console.log(`[DAYTONA] Running: ${command}`);
      await this.addLog(workspaceId, 'info', `Building project: ${command}`);

      const result = await this.executeCommand(workspaceId, command);

      if (result.exitCode !== 0) {
        console.warn(`[DAYTONA] ⚠ Build command failed (exit code ${result.exitCode}) - continuing anyway`);
        console.warn(`[DAYTONA] stderr:`, result.stderr);
        await this.addLog(workspaceId, 'warn', `Build failed but continuing: ${result.stderr.substring(0, 500)}`);
        // Don't return false - some projects don't need builds for dev mode
        return { success: true, output: `Build failed: ${result.stderr}` };
      }

      console.log(`[DAYTONA] ✓ Project built successfully`);
      await this.addLog(workspaceId, 'info', 'Project built successfully');

      return { success: true, output: result.stdout };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.warn(`[DAYTONA] ⚠ Error building project (non-fatal):`, errorMsg);
      await this.addLog(workspaceId, 'warn', `Build error (non-fatal): ${errorMsg}`);
      return { success: true, output: errorMsg }; // Return success=true to continue
    }
  }

  /**
   * Restart dev server (kills existing and starts new one)
   */
  async restartDevServer(workspaceId: bigint, command?: string): Promise<void> {
    console.log(`[DAYTONA] Restarting dev server for workspace ${workspaceId}`);

    const workspace = await this.getWorkspace(workspaceId);
    if (workspace.status !== 'running') {
      throw new ValidationError('Workspace is not running');
    }

    try {
      // Kill existing dev server processes (common ports)
      const killCommands = [
        'pkill -f "npm run dev" || true',
        'pkill -f "npm run start" || true',
        'pkill -f "vite" || true',
        'pkill -f "next" || true',
        'fuser -k 3000/tcp 2>/dev/null || true',
        'fuser -k 5173/tcp 2>/dev/null || true',
        'fuser -k 8000/tcp 2>/dev/null || true',
        'fuser -k 8080/tcp 2>/dev/null || true'
      ];

      for (const cmd of killCommands) {
        try {
          await this.executeCommand(workspaceId, cmd);
        } catch (error) {
          // Ignore errors - process may not exist
        }
      }

      console.log(`[DAYTONA] ✓ Killed existing dev server processes`);
      await this.addLog(workspaceId, 'info', 'Stopped existing dev server');

      // Start new dev server if command provided
      if (command) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait a moment
        await this.startDevServer(workspaceId, command);
      }
    } catch (error) {
      console.error(`[DAYTONA] Error restarting dev server:`, error);
      throw error;
    }
  }

  /**
   * Add log entry for workspace
   */
  private async addLog(
    workspaceId: bigint,
    level: 'info' | 'warn' | 'error' | 'debug',
    message: string
  ): Promise<void> {
    await db.exec`
      INSERT INTO workspace_logs (workspace_id, log_level, message)
      VALUES (${workspaceId}, ${level}, ${message})
    `;
  }

  /**
   * Get logs for workspace
   */
  async getLogs(workspaceId: bigint, limit: number = 100): Promise<Array<{
    id: bigint;
    log_level: string;
    message: string;
    timestamp: Date;
  }>> {
    const logs: Array<{
      id: bigint;
      log_level: string;
      message: string;
      timestamp: Date;
    }> = [];

    for await (const log of db.query<{
      id: bigint;
      log_level: string;
      message: string;
      timestamp: Date;
    }>`
      SELECT * FROM workspace_logs
      WHERE workspace_id = ${workspaceId}
      ORDER BY timestamp DESC
      LIMIT ${limit}
    `) {
      logs.push(log);
    }

    return logs.reverse(); // Return in chronological order
  }
}

// Singleton instance
export const daytonaManager = new DaytonaManager();
