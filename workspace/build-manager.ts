/**
 * Build Manager - Comprehensive build orchestration with Daytona integration
 * Provides live build status, detailed logging, and real-time progress tracking
 */

import { db } from './daytona-manager.js';
import { daytonaManager } from './daytona-manager.js';
import { contextManager } from '../ai/context-manager.js';
import type { TechStack } from '../shared/types.js';

type BuildPhase = 'pending' | 'setup' | 'install' | 'build' | 'test' | 'deploy' | 'complete' | 'failed';
type BuildStatus = 'pending' | 'building' | 'success' | 'failed';
type BuildEventType = 'phase_change' | 'log' | 'error' | 'warning' | 'progress';

interface Build {
  id: bigint;
  project_id: bigint;
  workspace_id?: bigint;
  status: BuildStatus;
  phase: BuildPhase;
  daytona_session_id?: string;
  current_step?: string;
  total_steps?: number;
  step_logs?: string;
  live_output?: string;
  install_logs?: string;
  build_logs?: string;
  error_message?: string;
  duration_ms?: number;
  metadata?: Record<string, any>;
  started_at?: Date;
  completed_at?: Date;
  created_at: Date;
}

interface BuildEvent {
  id: bigint;
  build_id: bigint;
  event_type: BuildEventType;
  phase?: BuildPhase;
  message?: string;
  metadata?: Record<string, any>;
  timestamp: Date;
}

export class BuildManager {
  /**
   * Create a new build with detailed tracking
   */
  async createBuild(
    projectId: bigint,
    workspaceId: bigint,
    metadata?: Record<string, any>
  ): Promise<Build> {
    const build = await db.queryRow<Build>`
      INSERT INTO builds (
        project_id,
        workspace_id,
        status,
        phase,
        total_steps,
        metadata,
        started_at
      )
      VALUES (
        ${projectId},
        ${workspaceId},
        'pending',
        'pending',
        5,
        ${metadata ? JSON.stringify(metadata) : null},
        NOW()
      )
      RETURNING *
    `;

    if (!build) {
      throw new Error('Failed to create build');
    }

    await this.addBuildEvent(build.id, 'phase_change', 'pending', 'Build created', metadata);

    console.log(`[BUILD] Created build ${build.id} for project ${projectId}`);

    return build;
  }

  /**
   * Start a build with full Daytona session integration
   */
  async startBuild(buildId: bigint): Promise<void> {
    const build = await this.getBuild(buildId);

    if (!build.workspace_id) {
      throw new Error('Build has no workspace assigned');
    }

    console.log(`[BUILD ${buildId}] Starting build process`);

    // Run build in background with full error handling
    this.runBuildWithSession(build).catch(async (error) => {
      console.error(`[BUILD ${buildId}] Fatal error:`, error);
      await this.updateBuildPhase(buildId, 'failed', 'Build failed due to fatal error');
      await this.updateBuildStatus(buildId, 'failed', error instanceof Error ? error.message : 'Unknown error');
    });
  }

  /**
   * Run build using Daytona process session for live monitoring
   */
  private async runBuildWithSession(build: Build): Promise<void> {
    const startTime = Date.now();
    const buildId = build.id;
    const workspaceId = build.workspace_id!;

    try {
      // Phase 1: Setup
      await this.updateBuildPhase(buildId, 'setup', 'Initializing build environment');
      await this.updateBuildStep(buildId, 'Creating Daytona process session', 1, 5);

      const workspace = await daytonaManager.getWorkspace(workspaceId);

      if (workspace.status !== 'running') {
        throw new Error(`Workspace is not running (status: ${workspace.status})`);
      }

      // Create Daytona process session for this build
      const sessionId = `build-${buildId}-${Date.now()}`;

      if (daytonaManager['daytona'] && workspace.daytona_sandbox_id) {
        const sandbox = await daytonaManager['getSandbox'](workspace);
        await sandbox.process.createSession(sessionId);

        await db.exec`
          UPDATE builds
          SET daytona_session_id = ${sessionId}
          WHERE id = ${buildId}
        `;

        console.log(`[BUILD ${buildId}] Created Daytona session: ${sessionId}`);
        await this.addBuildEvent(buildId, 'log', 'setup', `Daytona session created: ${sessionId}`);
      }

      // Detect tech stack
      await this.updateBuildStep(buildId, 'Detecting project technology stack', 2, 5);
      const techStack = await daytonaManager.detectTechStack(workspaceId, build.project_id);

      console.log(`[BUILD ${buildId}] Detected tech stack:`, techStack);
      await this.addBuildEvent(buildId, 'log', 'setup', `Tech stack: ${techStack.language}/${techStack.framework}`, { techStack });

      // Update metadata with tech stack
      await db.exec`
        UPDATE builds
        SET metadata = ${JSON.stringify({ ...build.metadata, techStack })}
        WHERE id = ${buildId}
      `;

      // Phase 2: Install dependencies
      await this.updateBuildPhase(buildId, 'install', 'Installing dependencies');
      await this.updateBuildStep(buildId, `Installing dependencies with ${techStack.packageManager}`, 3, 5);

      const installResult = await this.runBuildCommand(
        buildId,
        build.project_id,
        workspaceId,
        sessionId,
        this.getInstallCommand(techStack),
        'install'
      );

      if (!installResult.success) {
        throw new Error(`Dependency installation failed: ${installResult.error}`);
      }

      await db.exec`
        UPDATE builds
        SET install_logs = ${installResult.output}
        WHERE id = ${buildId}
      `;

      // Phase 3: Build
      const buildCommand = this.getBuildCommand(techStack);

      if (buildCommand) {
        await this.updateBuildPhase(buildId, 'build', 'Building project');
        await this.updateBuildStep(buildId, `Running build command: ${buildCommand}`, 4, 5);

        const buildResult = await this.runBuildCommand(
          buildId,
          build.project_id,
          workspaceId,
          sessionId,
          buildCommand,
          'build'
        );

        if (!buildResult.success) {
          // Some projects don't need builds for dev mode - log warning but continue
          console.warn(`[BUILD ${buildId}] Build command failed but continuing:`, buildResult.error);
          await this.addBuildEvent(buildId, 'warning', 'build', `Build command failed: ${buildResult.error}`);
        }

        await db.exec`
          UPDATE builds
          SET build_logs = ${buildResult.output}
          WHERE id = ${buildId}
        `;
      } else {
        console.log(`[BUILD ${buildId}] No build command needed for ${techStack.framework}`);
        await this.addBuildEvent(buildId, 'log', 'build', 'No build step required');
      }

      // Phase 4: Complete
      await this.updateBuildPhase(buildId, 'complete', 'Build completed successfully');
      await this.updateBuildStep(buildId, 'Finalizing build', 5, 5);

      const duration = Date.now() - startTime;

      await db.exec`
        UPDATE builds
        SET
          status = 'success',
          phase = 'complete',
          duration_ms = ${duration},
          completed_at = NOW()
        WHERE id = ${buildId}
      `;

      await this.addBuildEvent(buildId, 'phase_change', 'complete', `Build completed in ${duration}ms`, { duration });

      console.log(`[BUILD ${buildId}] ✓ Build completed successfully in ${duration}ms`);

      // Cleanup Daytona session
      if (sessionId && daytonaManager['daytona'] && workspace.daytona_sandbox_id) {
        try {
          const sandbox = await daytonaManager['getSandbox'](workspace);
          await sandbox.process.deleteSession(sessionId);
          console.log(`[BUILD ${buildId}] Cleaned up Daytona session: ${sessionId}`);
        } catch (cleanupError) {
          console.warn(`[BUILD ${buildId}] Failed to cleanup session:`, cleanupError);
        }
      }

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      console.error(`[BUILD ${buildId}] ✗ Build failed:`, errorMessage);

      await db.exec`
        UPDATE builds
        SET
          status = 'failed',
          phase = 'failed',
          error_message = ${errorMessage},
          duration_ms = ${duration},
          completed_at = NOW()
        WHERE id = ${buildId}
      `;

      await this.addBuildEvent(buildId, 'error', 'failed', `Build failed: ${errorMessage}`, { error: errorMessage });

      throw error;
    }
  }

  /**
   * Run a build command using Daytona session with live log streaming
   */
  private async runBuildCommand(
    buildId: bigint,
    projectId: bigint,
    workspaceId: bigint,
    sessionId: string,
    command: string,
    logType: 'install' | 'build'
  ): Promise<{ success: boolean; output: string; error?: string }> {
    console.log(`[BUILD ${buildId}] Running ${logType} command: ${command}`);

    const workspace = await daytonaManager.getWorkspace(workspaceId);

    if (!daytonaManager['daytona'] || !workspace.daytona_sandbox_id) {
      // Fallback to regular executeCommand
      try {
        const result = await daytonaManager.executeCommand(workspaceId, command);

        if (result.exitCode !== 0) {
          return {
            success: false,
            output: result.stdout,
            error: result.stderr
          };
        }

        return {
          success: true,
          output: result.stdout
        };
      } catch (error) {
        return {
          success: false,
          output: '',
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }

    try {
      const sandbox = await daytonaManager['getSandbox'](workspace);

      // Execute command in session asynchronously for live monitoring
      const execResult = await sandbox.process.executeSessionCommand(sessionId, {
        command,
        runAsync: true
      });

      const cmdId = execResult.cmdId!;
      console.log(`[BUILD ${buildId}] Command started with ID: ${cmdId}`);

      // Stream logs in real-time
      let stdoutBuffer = '';
      let stderrBuffer = '';

      await sandbox.process.getSessionCommandLogs(
        sessionId,
        cmdId,
        (chunk: string) => {
          stdoutBuffer += chunk;
          console.log(`[BUILD ${buildId}] [STDOUT]`, chunk);

          // Update live output in database
          this.updateLiveOutput(buildId, chunk, logType).catch(err =>
            console.error(`Failed to update live output:`, err)
          );
        },
        (chunk: string) => {
          stderrBuffer += chunk;
          console.log(`[BUILD ${buildId}] [STDERR]`, chunk);

          // Log errors as build events
          this.addBuildEvent(buildId, 'error', undefined, chunk).catch(err =>
            console.error(`Failed to add error event:`, err)
          );

          // PRIORITY 1 FIX: Forward errors to context manager for terminal agent
          this.forwardBuildError(buildId, projectId, chunk, logType).catch(err =>
            console.error(`Failed to forward build error to context manager:`, err)
          );
        }
      );

      // Get final command status
      const cmd = await sandbox.process.getSessionCommand(sessionId, cmdId);
      const exitCode = cmd.exitCode ?? 1;

      console.log(`[BUILD ${buildId}] Command completed with exit code: ${exitCode}`);

      const output = stdoutBuffer + stderrBuffer;

      if (exitCode !== 0) {
        return {
          success: false,
          output,
          error: stderrBuffer || `Command failed with exit code ${exitCode}`
        };
      }

      return {
        success: true,
        output
      };

    } catch (error) {
      console.error(`[BUILD ${buildId}] Error running command:`, error);
      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Update build phase
   */
  private async updateBuildPhase(buildId: bigint, phase: BuildPhase, message?: string): Promise<void> {
    await db.exec`
      UPDATE builds
      SET phase = ${phase}, updated_at = NOW()
      WHERE id = ${buildId}
    `;

    await this.addBuildEvent(buildId, 'phase_change', phase, message || `Phase: ${phase}`);

    console.log(`[BUILD ${buildId}] Phase: ${phase} ${message ? `- ${message}` : ''}`);
  }

  /**
   * Update current build step
   */
  private async updateBuildStep(
    buildId: bigint,
    step: string,
    currentStep: number,
    totalSteps: number
  ): Promise<void> {
    await db.exec`
      UPDATE builds
      SET current_step = ${step}, total_steps = ${totalSteps}
      WHERE id = ${buildId}
    `;

    await this.addBuildEvent(buildId, 'progress', undefined, `[${currentStep}/${totalSteps}] ${step}`, {
      currentStep,
      totalSteps
    });

    console.log(`[BUILD ${buildId}] [${currentStep}/${totalSteps}] ${step}`);
  }

  /**
   * Update live output
   */
  private async updateLiveOutput(buildId: bigint, chunk: string, logType: 'install' | 'build'): Promise<void> {
    // Append to live_output
    await db.exec`
      UPDATE builds
      SET live_output = COALESCE(live_output, '') || ${chunk}
      WHERE id = ${buildId}
    `;

    // Append to specific log type
    if (logType === 'install') {
      await db.exec`
        UPDATE builds
        SET install_logs = COALESCE(install_logs, '') || ${chunk}
        WHERE id = ${buildId}
      `;
    } else {
      await db.exec`
        UPDATE builds
        SET build_logs = COALESCE(build_logs, '') || ${chunk}
        WHERE id = ${buildId}
      `;
    }
  }

  /**
   * Update build status
   */
  private async updateBuildStatus(buildId: bigint, status: BuildStatus, errorMessage?: string): Promise<void> {
    if (status === 'success' || status === 'failed') {
      await db.exec`
        UPDATE builds
        SET
          status = ${status},
          error_message = ${errorMessage || null},
          completed_at = NOW()
        WHERE id = ${buildId}
      `;
    } else {
      await db.exec`
        UPDATE builds
        SET
          status = ${status},
          error_message = ${errorMessage || null}
        WHERE id = ${buildId}
      `;
    }
  }

  /**
   * Add build event
   */
  private async addBuildEvent(
    buildId: bigint,
    eventType: BuildEventType,
    phase?: BuildPhase,
    message?: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    await db.exec`
      INSERT INTO build_events (build_id, event_type, phase, message, metadata)
      VALUES (
        ${buildId},
        ${eventType},
        ${phase || null},
        ${message || null},
        ${metadata ? JSON.stringify(metadata) : null}
      )
    `;
  }

  /**
   * Get build by ID
   */
  async getBuild(buildId: bigint): Promise<Build> {
    const build = await db.queryRow<Build>`
      SELECT * FROM builds WHERE id = ${buildId}
    `;

    if (!build) {
      throw new Error(`Build not found: ${buildId}`);
    }

    return build;
  }

  /**
   * Get build events
   */
  async getBuildEvents(buildId: bigint, limit: number = 100): Promise<BuildEvent[]> {
    const events: BuildEvent[] = [];

    for await (const event of db.query<BuildEvent>`
      SELECT * FROM build_events
      WHERE build_id = ${buildId}
      ORDER BY timestamp ASC
      LIMIT ${limit}
    `) {
      events.push(event);
    }

    return events;
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
   * Get install command for tech stack
   */
  private getInstallCommand(techStack: TechStack): string {
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
      none: 'echo "No dependencies to install"'
    };

    return commands[techStack.packageManager] || 'echo "Unknown package manager"';
  }

  /**
   * Get build command for tech stack
   */
  private getBuildCommand(techStack: TechStack): string | null {
    const commands: Record<string, string | null> = {
      nextjs: 'npm run build',
      react: 'npm run build',
      vue: 'npm run build',
      angular: 'npm run build',
      svelte: 'npm run build',
      express: null,
      nestjs: 'npm run build',
      django: 'python manage.py collectstatic --noinput',
      flask: null,
      fastapi: null,
      maven: 'mvn package -DskipTests',
      gradle: './gradlew build -x test',
      generic: null
    };

    return commands[techStack.framework] ?? null;
  }

  /**
   * Forward build error to context manager for automatic terminal agent notification
   * PRIORITY 1 FIX: Enables automatic error forwarding to terminal agent
   */
  private async forwardBuildError(
    buildId: bigint,
    projectId: bigint,
    errorText: string,
    phase: 'install' | 'build'
  ): Promise<void> {
    try {
      // Only forward if error text contains actual error indicators
      const hasError = this.isErrorOutput(errorText);
      if (!hasError) {
        return; // Skip warnings and info messages
      }

      console.log(`[BUILD ${buildId}] Forwarding error to context manager for terminal agent`);

      await contextManager.upsertContextItem(
        projectId,
        'error',
        `build_${buildId}_${phase}_${Date.now()}`,
        errorText,
        {
          buildId: buildId.toString(),
          source: 'build',
          phase,
          timestamp: new Date().toISOString(),
          autoForwarded: true,
          severity: this.detectErrorSeverity(errorText)
        }
      );
    } catch (err) {
      console.error(`[BUILD ${buildId}] Failed to forward build error:`, err);
    }
  }

  /**
   * Detect if text contains actual errors (not just warnings)
   */
  private isErrorOutput(text: string): boolean {
    const errorPatterns = [
      /error:/i,
      /failed/i,
      /cannot find module/i,
      /module not found/i,
      /syntaxerror/i,
      /typeerror/i,
      /referenceerror/i,
      /uncaught/i,
      /unhandled/i,
      /exception/i,
      /fatal/i
    ];

    return errorPatterns.some(pattern => pattern.test(text));
  }

  /**
   * Detect error severity from error text
   */
  private detectErrorSeverity(text: string): 'critical' | 'high' | 'medium' {
    if (/fatal|exception|uncaught|unhandled/i.test(text)) {
      return 'critical';
    }
    if (/error:|failed|cannot/i.test(text)) {
      return 'high';
    }
    return 'medium';
  }
}

// Singleton instance
export const buildManager = new BuildManager();
