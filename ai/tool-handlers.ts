/**
 * Agent Tool Execution Handlers
 * Routes AI agent tool calls to workspace operations
 */

import { daytonaManager } from '../workspace/daytona-manager.js';
import { db } from '../projects/db.js';
import { createGitManager } from '../git/git-manager.js';
import { gridfs } from '../vfs/gridfs.js';

export interface ToolExecutionContext {
  workspaceId: bigint;
  projectId: bigint;
  jobId: bigint;
}

export interface ToolExecutionResult {
  success: boolean;
  result?: any;
  error?: string;
}

/**
 * Execute an agent tool call
 */
export async function executeAgentTool(
  toolUse: any,
  context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  const { workspaceId, projectId, jobId } = context;

  try {
    console.log(`[Tool Handler] Executing tool: ${toolUse.name}`);

    // Log tool execution
    await logToolExecution(jobId, toolUse.name, 'info', `Executing ${toolUse.name}`);

    let result: any;

    switch (toolUse.name) {
      case 'write_to_file':
        result = await handleWriteFile(toolUse.input, workspaceId, projectId, jobId);
        break;

      case 'read_file':
        result = await handleReadFile(toolUse.input, workspaceId, projectId, jobId);
        break;

      case 'execute_command':
        result = await handleExecuteCommand(toolUse.input, workspaceId, jobId);
        break;

      case 'list_files':
        result = await handleListFiles(toolUse.input, workspaceId, jobId);
        break;

      case 'search_files':
        result = await handleSearchFiles(toolUse.input, workspaceId, jobId);
        break;

      case 'start_build':
        result = await handleStartBuild(toolUse.input, workspaceId, projectId, jobId);
        break;

      case 'get_build_status':
        result = await handleGetBuildStatus(toolUse.input, projectId, jobId);
        break;

      case 'check_process_status':
        result = await handleCheckProcessStatus(toolUse.input, workspaceId, jobId);
        break;

      case 'get_live_logs':
        result = await handleGetLiveLogs(toolUse.input, workspaceId, jobId);
        break;

      case 'run_dev_server':
        result = await handleRunDevServer(toolUse.input, workspaceId, jobId);
        break;

      case 'ask_followup_question':
        result = await handleAskFollowup(toolUse.input, jobId);
        break;

      case 'attempt_completion':
        result = await handleAttemptCompletion(toolUse.input, projectId, workspaceId, jobId);
        break;

      case 'run_code':
        result = await handleCodeRun(toolUse.input, workspaceId, jobId);
        break;

      case 'edit_file':
        result = await handleEditFile(toolUse.input, workspaceId, projectId, jobId);
        break;

      case 'git_status':
        result = await handleGitStatus(toolUse.input, projectId, jobId);
        break;

      case 'git_commit':
        result = await handleGitCommit(toolUse.input, projectId, jobId);
        break;

      case 'git_log':
        result = await handleGitLog(toolUse.input, projectId, jobId);
        break;

      case 'git_diff':
        result = await handleGitDiff(toolUse.input, projectId, jobId);
        break;

      case 'install_package':
        result = await handleInstallPackage(toolUse.input, workspaceId, projectId, jobId);
        break;

      case 'remove_package':
        result = await handleRemovePackage(toolUse.input, workspaceId, projectId, jobId);
        break;

      // Daytona sandbox tools
      case 'daytona_execute_command':
        result = await handleDaytonaExecuteCommand(toolUse.input, workspaceId, jobId);
        break;

      case 'daytona_read_file':
        result = await handleDaytonaReadFile(toolUse.input, workspaceId, jobId);
        break;

      case 'daytona_write_file':
        result = await handleDaytonaWriteFile(toolUse.input, workspaceId, jobId);
        break;

      case 'daytona_list_files':
        result = await handleDaytonaListFiles(toolUse.input, workspaceId, jobId);
        break;

      case 'daytona_get_preview_url':
        result = await handleDaytonaGetPreviewUrl(toolUse.input, workspaceId, jobId);
        break;

      case 'daytona_git_clone':
        result = await handleDaytonaGitClone(toolUse.input, workspaceId, jobId);
        break;

      case 'daytona_get_workspace_status':
        result = await handleDaytonaGetWorkspaceStatus(toolUse.input, workspaceId, jobId);
        break;

      case 'ensure_workspace_running':
        result = await handleEnsureWorkspaceRunning(toolUse.input, workspaceId, jobId);
        break;

      case 'restart_workspace':
        result = await handleRestartWorkspace(toolUse.input, workspaceId, projectId, jobId);
        break;

      case 'force_rebuild_workspace':
        result = await handleForceRebuildWorkspace(toolUse.input, workspaceId, projectId, jobId);
        break;

      default:
        throw new Error(`Unknown tool: ${toolUse.name}`);
    }

    await logToolExecution(
      jobId,
      toolUse.name,
      'info',
      `Successfully executed ${toolUse.name}`,
      result
    );

    return {
      success: true,
      result
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Tool Handler] Error executing ${toolUse.name}:`, errorMsg);

    await logToolExecution(jobId, toolUse.name, 'error', errorMsg);

    return {
      success: false,
      error: errorMsg
    };
  }
}

/**
 * Handle write_to_file tool
 * ✅ ARCHITECTURAL REVERSAL: Writes to Daytona FIRST, then backs up to VFS
 * This makes code immediately executable as it's being generated
 */
async function handleWriteFile(
  input: { path: string; content: string; line_count?: number },
  workspaceId: bigint,
  projectId: bigint,
  jobId: bigint
): Promise<any> {
  const { path, content, line_count } = input;

  // Validate line count if provided
  if (line_count !== undefined) {
    const actualLines = content.split('\n').length;
    if (actualLines !== line_count) {
      console.warn(`Line count mismatch: expected ${line_count}, got ${actualLines}`);
    }
  }

  // ✅ NEW FLOW: Write to Daytona sandbox FIRST (code is immediately executable)
  await daytonaManager.writeFile(workspaceId, path, content);
  console.log(`[Tool Handler] ✓ Wrote file to Daytona sandbox: ${path} (${content.length} bytes)`);

  // Then backup to VFS for persistence
  const { getMimeType } = await import('../shared/utils.js');
  const { gridfs } = await import('../vfs/gridfs.js');

  const metadata = await gridfs.writeFile(
    projectId,
    path,
    Buffer.from(content, 'utf-8'),
    getMimeType(path)
  );

  console.log(`[Tool Handler] ✓ Backed up file to VFS: ${path}`);

  // Update progress
  await updateJobProgress(jobId, `Created ${path}`);

  // Auto-index code files for RAG
  await indexFileForRAG(projectId, path, content, jobId);

  return {
    success: true,
    path,
    bytes: content.length,
    lines: content.split('\n').length,
    vfs_file_id: metadata.gridfs_file_id,
    daytona_written: true
  };
}

/**
 * Handle read_file tool
 * ✅ ARCHITECTURAL REVERSAL: Reads from Daytona FIRST (where files are now written), then falls back to VFS
 */
async function handleReadFile(
  input: { path: string; line_range?: { start: number; end: number } },
  workspaceId: bigint,
  projectId: bigint,
  jobId: bigint
): Promise<any> {
  const { path, line_range } = input;
  let content: string;
  let source: string;

  // ✅ NEW FLOW: Try Daytona FIRST (where files are now written during generation)
  try {
    content = await daytonaManager.readFile(workspaceId, path);
    source = 'daytona';
    console.log(`[Tool Handler] Read file from Daytona sandbox: ${path}`);
  } catch (daytonaError) {
    // Fall back to reading from VFS (for older files or backups)
    console.log(`[Tool Handler] File not in Daytona, reading from VFS: ${path}`);
    try {
      const { gridfs } = await import('../vfs/gridfs.js');
      const buffer = await gridfs.readFile(projectId, path);
      content = buffer.toString('utf-8');
      source = 'vfs';
    } catch (vfsError) {
      throw new Error(`File not found in Daytona or VFS: ${path}`);
    }
  }

  // Handle line range if requested
  if (line_range) {
    const lines = content.split('\n');
    const selectedLines = lines.slice(line_range.start - 1, line_range.end);
    return {
      path,
      content: selectedLines.join('\n'),
      line_range,
      source
    };
  }

  return {
    path,
    content,
    source
  };
}

/**
 * Handle execute_command tool
 */
async function handleExecuteCommand(
  input: { command: string; cwd?: string },
  workspaceId: bigint,
  jobId: bigint
): Promise<any> {
  const { command, cwd } = input;

  // Execute command in workspace
  const result = await daytonaManager.executeCommand(workspaceId, command);

  // Update progress
  await updateJobProgress(jobId, `Executed: ${command}`);

  return {
    command,
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
    success: result.exitCode === 0
  };
}

/**
 * Handle list_files tool
 */
async function handleListFiles(
  input: { path?: string; recursive?: boolean },
  workspaceId: bigint,
  jobId: bigint
): Promise<any> {
  const { path = '.', recursive = false } = input;

  // Use ls or find command depending on recursive flag
  const command = recursive ? `find ${path} -type f` : `ls -la ${path}`;
  const result = await daytonaManager.executeCommand(workspaceId, command);

  return {
    path,
    files: result.stdout.split('\n').filter(f => f.trim())
  };
}

/**
 * Handle search_files tool
 */
async function handleSearchFiles(
  input: { pattern: string; path?: string },
  workspaceId: bigint,
  jobId: bigint
): Promise<any> {
  const { pattern, path = '.' } = input;

  // Use find with pattern
  const command = `find ${path} -name "${pattern}"`;
  const result = await daytonaManager.executeCommand(workspaceId, command);

  return {
    pattern,
    matches: result.stdout.split('\n').filter(f => f.trim())
  };
}

/**
 * Handle ask_followup_question tool
 */
async function handleAskFollowup(
  input: { question: string },
  jobId: bigint
): Promise<any> {
  const { question } = input;

  // Log the question
  await logToolExecution(jobId, 'ask_followup_question', 'warning', question);

  // Store question in job metadata for UI to display
  await db.exec`
    UPDATE generation_jobs
    SET current_step = 'awaiting_user_input'
    WHERE id = ${jobId}
  `;

  return {
    question,
    status: 'awaiting_user_response'
  };
}

/**
 * Handle attempt_completion tool
 * ✅ ARCHITECTURAL REVERSAL: Backs up Daytona sandbox to VFS, extracts public preview URL
 * Code is already written and running in Daytona - we just need to backup and get the URL
 */
async function handleAttemptCompletion(
  input: { result: string; command?: string },
  projectId: bigint,
  workspaceId: bigint,
  jobId: bigint
): Promise<any> {
  const { result, command } = input;

  console.log(`[Completion] Project generation completed: ${result}`);
  console.log(`[Completion] ========== STARTING BACKUP AND PREVIEW EXTRACTION ==========`);

  let previewUrl: string | null = null;
  let deploymentStatus = 'completed';

  try {
    // ✅ NEW STEP 1: Backup files from Daytona sandbox to VFS for persistence
    console.log(`[Completion] STEP 1: Backing up generated code from Daytona to VFS...`);
    await updateJobProgress(jobId, 'Backing up files to VFS...');
    await updateDeploymentProgress(jobId, projectId, 'deploying', 60, 'Backing up files to VFS');

    const backupResult = await daytonaManager.backupProjectFromDaytonaToVFS(workspaceId, projectId);
    console.log(`[Completion] ✓ Backed up ${backupResult.filesBackedUp} files from Daytona to VFS`);
    await logToolExecution(
      jobId,
      'attempt_completion',
      'info',
      `Backed up ${backupResult.filesBackedUp} files from Daytona sandbox to VFS for persistence`
    );
    await updateDeploymentProgress(jobId, projectId, 'deploying', 70, `Backed up ${backupResult.filesBackedUp} files`);

    // ✅ STEP 2: Detect technology stack (for metadata and preview URL logic)
    console.log(`[Completion] STEP 2: Detecting technology stack...`);
    await updateJobProgress(jobId, 'Detecting tech stack...');
    await updateDeploymentProgress(jobId, projectId, 'deploying', 75, 'Detecting technology stack');

    const techStack = await daytonaManager.detectTechStack(workspaceId, projectId);
    console.log(`[Completion] ✓ Detected: ${techStack.language} / ${techStack.framework} / ${techStack.packageManager}`);
    await logToolExecution(
      jobId,
      'attempt_completion',
      'info',
      `Detected tech stack: ${techStack.language} with ${techStack.framework}`
    );
    await updateDeploymentProgress(jobId, projectId, 'deploying', 80, 'Tech stack detected');

    // ✅ NOTE: Skipping dependency installation and build steps
    // Dependencies and builds should have already happened during code generation
    // If the agent needed to install deps or build, it would have done so via execute_command tool
    console.log(`[Completion] ℹ Skipping dependency installation - should already be done during generation`);
    console.log(`[Completion] ℹ Skipping build step - should already be done if needed during generation`);
  } catch (backupError) {
    console.error(`[Completion] Backup pipeline error:`, backupError);
    await logToolExecution(
      jobId,
      'attempt_completion',
      'error',
      `Backup error: ${backupError instanceof Error ? backupError.message : 'Unknown error'}`
    );
    deploymentStatus = 'failed';
  }

  // ✅ STEP 3: Get preview URL (dev server might already be running or needs to be started)
  // Determine the command to use (provided by AI or inferred)
  let devCommand = command;

  try {
    // If no command provided, try to infer from package.json
    if (!devCommand) {
      console.log(`[Completion] STEP 3: No command provided, attempting to infer from package.json`);
      await updateJobProgress(jobId, 'Inferring dev server command...');

      const inferredCommand = await daytonaManager.inferDevCommand(workspaceId);
      if (inferredCommand) {
        console.log(`[Completion] ✓ Inferred command: ${inferredCommand}`);
        devCommand = inferredCommand;
        await logToolExecution(jobId, 'attempt_completion', 'info', `Inferred dev command: ${inferredCommand}`);
      } else {
        console.log(`[Completion] ⚠ Could not infer dev command - no preview URL will be available`);
        await logToolExecution(
          jobId,
          'attempt_completion',
          'warning',
          'No dev server command provided and could not infer from package.json. Preview URL unavailable.'
        );
        deploymentStatus = 'no_preview';
      }
    }

    // If we have a command (either provided or inferred), start the dev server
    if (devCommand) {
      console.log(`[Completion] STEP 4: Starting dev server with command: ${devCommand}`);
      await updateJobProgress(jobId, 'Starting development server...');
      await updateDeploymentProgress(jobId, projectId, 'deploying', 90, 'Starting development server');

      try {
        await logToolExecution(jobId, 'attempt_completion', 'info', `Starting dev server: ${devCommand}`);

        // Detect expected port from command
        const expectedPort = daytonaManager.detectPortFromCommand(devCommand);
        console.log(`[Completion] Expected port: ${expectedPort}`);

        // Start the dev server in background (non-blocking)
        const serverResult = await daytonaManager.startDevServer(workspaceId, devCommand);

        if (serverResult.processStarted) {
          console.log(`[Completion] ✓ Dev server process started`);
          await updateDeploymentProgress(jobId, projectId, 'deploying', 92, 'Dev server process started');

          // Use detected port if available, otherwise use expected port
          const actualPort = serverResult.detectedPort || expectedPort;
          console.log(`[Completion] Using port ${actualPort} for preview URL`);

          // Wait additional time for server to fully initialize
          console.log(`[Completion] Waiting 3 seconds for server initialization...`);
          await new Promise(resolve => setTimeout(resolve, 3000));

          // Get the preview URL
          await updateJobProgress(jobId, 'Extracting preview URL...');
          await updateDeploymentProgress(jobId, projectId, 'deploying', 94, 'Extracting preview URL');
          const preview = await daytonaManager.getPreviewUrl(workspaceId, actualPort);

          if (preview) {
            previewUrl = preview.url;
            console.log(`[Completion] ✓ Got preview URL: ${previewUrl}`);
            await updateDeploymentProgress(jobId, projectId, 'deploying', 96, 'Preview URL obtained');

            // Health check the preview URL
            await updateJobProgress(jobId, 'Verifying server health...');
            await updateDeploymentProgress(jobId, projectId, 'deploying', 97, 'Verifying server health');
            const isHealthy = await daytonaManager.healthCheckPreviewUrl(previewUrl, 8); // Extended attempts

            if (isHealthy) {
              console.log(`[Completion] ✓ Server health check passed`);
              await logToolExecution(jobId, 'attempt_completion', 'info', `Preview URL verified and responding: ${previewUrl}`);
              deploymentStatus = 'deployed';
              await updateDeploymentProgress(jobId, projectId, 'deployed', 99, 'Preview URL verified and ready');
            } else {
              console.log(`[Completion] ⚠ Server health check failed after extended attempts`);
              await logToolExecution(
                jobId,
                'attempt_completion',
                'warning',
                `Preview URL ${previewUrl} is not responding to health checks. The server may still be starting up or may have crashed. Please check the project manually.`
              );
              // Mark as deployed_unhealthy to distinguish from healthy deployments
              deploymentStatus = 'deployed_unhealthy';
              await updateDeploymentProgress(jobId, projectId, 'deployed_unhealthy', 98, 'Preview URL not responding to health checks');
            }

            // Update project with preview URL
            await db.exec`
              UPDATE projects
              SET
                deployment_url = ${previewUrl},
                deployment_status = ${deploymentStatus}
              WHERE id = ${projectId}
            `;
          } else {
            console.log(`[Completion] ⚠ Could not get preview URL`);
            await logToolExecution(jobId, 'attempt_completion', 'warning', 'Could not extract preview URL from sandbox');
            await updateDeploymentProgress(jobId, projectId, 'failed', 95, 'Could not extract preview URL');
          }
        } else {
          console.log(`[Completion] ⚠ Dev server process failed to start`);
          await logToolExecution(jobId, 'attempt_completion', 'warning', 'Dev server process failed to start');
          await updateDeploymentProgress(jobId, projectId, 'failed', 91, 'Dev server process failed to start');
        }
      } catch (serverError) {
        console.error(`[Completion] Error starting dev server:`, serverError);
        await logToolExecution(
          jobId,
          'attempt_completion',
          'warning',
          `Dev server start failed: ${serverError instanceof Error ? serverError.message : 'Unknown error'}`
        );
        deploymentStatus = 'failed';
        await updateDeploymentProgress(jobId, projectId, 'failed', 90, 'Dev server startup failed');
      }
    } else {
      console.log(`[Completion] No command provided, skipping dev server startup`);
      await updateDeploymentProgress(jobId, projectId, 'completed', 95, 'No dev server command provided');
    }
  } catch (error) {
    console.error(`[Completion] Error during completion:`, error);
    await logToolExecution(
      jobId,
      'attempt_completion',
      'error',
      `Completion error: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }

  // Auto-commit to Git
  let commitHash: string | null = null;
  try {
    console.log(`[Completion] Creating Git commit for generated code...`);
    await updateJobProgress(jobId, 'Creating Git commit...');

    const { createGitManager } = await import('../git/git-manager.js');
    const git = createGitManager(projectId);

    try {
      // Initialize Git if not already done
      await git.init(projectId);

      // Sync files from VFS to Git working directory
      await git.syncFromVFS(projectId);

      // Create commit
      const commit = await git.commit(
        projectId,
        `Generated project: ${result}`,
        'Vaporform Agent',
        'agent@vaporform.dev'
      );

      commitHash = commit.commit_hash;
      console.log(`[Completion] ✓ Created Git commit: ${commitHash.substring(0, 7)}`);
      await logToolExecution(jobId, 'attempt_completion', 'info', `Created Git commit: ${commitHash.substring(0, 7)}`);

      // Check if GitHub is connected
      const project = await db.queryRow<{
        github_pat: string | null;
        github_repo_full_name: string | null;
        github_default_branch: string | null;
      }>`
        SELECT github_pat, github_repo_full_name, github_default_branch
        FROM projects
        WHERE id = ${projectId}
      `;

      // Auto-push to GitHub if connected
      if (project && project.github_pat && project.github_repo_full_name) {
        console.log(`[Completion] Pushing to GitHub: ${project.github_repo_full_name}...`);
        await updateJobProgress(jobId, 'Pushing to GitHub...');

        try {
          const remoteUrl = `https://${project.github_pat}@github.com/${project.github_repo_full_name}.git`;
          await git.addRemote('origin', remoteUrl);
          await git.push('origin', project.github_default_branch || 'main');

          console.log(`[Completion] ✓ Pushed to GitHub successfully`);
          await logToolExecution(
            jobId,
            'attempt_completion',
            'info',
            `Pushed to GitHub: ${project.github_repo_full_name}`
          );
        } catch (pushError) {
          console.error(`[Completion] Failed to push to GitHub:`, pushError);
          await logToolExecution(
            jobId,
            'attempt_completion',
            'warning',
            `Failed to push to GitHub: ${pushError instanceof Error ? pushError.message : 'Unknown error'}`
          );
        }
      }
    } finally {
      git.cleanup();
    }
  } catch (gitError) {
    console.error(`[Completion] Git operation failed:`, gitError);
    await logToolExecution(
      jobId,
      'attempt_completion',
      'warning',
      `Git commit failed: ${gitError instanceof Error ? gitError.message : 'Unknown error'}`
    );
  }

  // Update job and project status atomically in a transaction
  const tx = await db.begin();
  try {
    await tx.exec`
      UPDATE generation_jobs
      SET
        status = 'completed',
        progress = 100,
        current_step = 'Generation completed',
        completed_at = NOW(),
        metadata = jsonb_set(
          COALESCE(metadata, '{}'::jsonb),
          '{commit_hash}',
          ${commitHash ? `"${commitHash}"` : 'null'}
        )
      WHERE id = ${jobId}
    `;

    await tx.exec`
      UPDATE projects
      SET
        generation_status = 'completed',
        deployment_status = ${deploymentStatus},
        current_commit_hash = ${commitHash}
      WHERE id = ${projectId}
    `;

    await tx.commit();
    console.log(`[Completion] ✓ Successfully updated project and job status`);
  } catch (txError) {
    await tx.rollback();
    console.error(`[Completion] Transaction failed for status updates:`, txError);
    throw new Error(`Failed to update completion status: ${txError instanceof Error ? txError.message : 'Unknown error'}`);
  }

  // Log completion
  await logToolExecution(jobId, 'attempt_completion', 'info', result);

  return {
    success: true,
    result,
    command,
    previewUrl,
    deploymentStatus,
    commitHash,
    completedAt: new Date().toISOString()
  };
}

/**
 * Update job progress
 */
async function updateJobProgress(jobId: bigint, step: string): Promise<void> {
  await db.exec`
    UPDATE generation_jobs
    SET current_step = ${step}
    WHERE id = ${jobId}
  `;
}

/**
 * Log tool execution to generation_logs
 */
async function logToolExecution(
  jobId: bigint,
  toolName: string,
  level: 'info' | 'warning' | 'error',
  message: string,
  metadata?: any
): Promise<void> {
  await db.exec`
    INSERT INTO generation_logs (
      job_id,
      level,
      message,
      tool_name,
      metadata
    ) VALUES (
      ${jobId},
      ${level},
      ${message},
      ${toolName},
      ${metadata || null}
    )
  `;
}

/**
 * Parse progress from tool executions
 * Estimates progress based on typical project generation phases
 */
export function estimateProgress(toolExecutions: any[]): number {
  const writeFileCount = toolExecutions.filter(t => t.tool_name === 'write_to_file').length;
  const executeCommandCount = toolExecutions.filter(t => t.tool_name === 'execute_command').length;
  const completionAttempt = toolExecutions.some(t => t.tool_name === 'attempt_completion');

  if (completionAttempt) return 100;

  // Rough estimation:
  // - Each file write contributes to progress
  // - Commands (npm install, build) are major milestones
  // - Cap at 95% until completion is called

  let progress = 0;

  // File writes: up to 60% of progress
  progress += Math.min(writeFileCount * 3, 60);

  // Command executions: up to 30% of progress
  progress += Math.min(executeCommandCount * 10, 30);

  return Math.min(progress, 95);
}

/**
 * Update deployment progress in both generation_jobs and projects tables
 * This ensures real-time UI updates during the deployment pipeline
 */
async function updateDeploymentProgress(
  jobId: bigint,
  projectId: bigint,
  deploymentStatus: string,
  progress: number,
  message: string
): Promise<void> {
  try {
    // Update project deployment status
    await db.exec`
      UPDATE projects
      SET
        deployment_status = ${deploymentStatus},
        updated_at = NOW()
      WHERE id = ${projectId}
    `;

    // Update generation job progress and current step
    await db.exec`
      UPDATE generation_jobs
      SET
        progress = ${progress},
        current_step = ${message},
        updated_at = NOW()
      WHERE id = ${jobId}
    `;

    console.log(`[Deployment Progress] ${progress}% - ${message} (status: ${deploymentStatus})`);
  } catch (error) {
    console.error(`[Deployment Progress] Failed to update progress:`, error);
    // Don't throw - progress updates should not break the pipeline
  }
}

/**
 * Helper functions for RAG file indexing
 */

/**
 * Check if a file should be indexed for RAG
 */
function shouldIndexFile(path: string): boolean {
  const codeExtensions = [
    '.ts', '.tsx', '.js', '.jsx',
    '.py', '.go', '.java', '.rb',
    '.css', '.scss', '.html', '.vue',
    '.c', '.cpp', '.h', '.hpp',
    '.rs', '.swift', '.kt', '.php',
    '.sql', '.graphql', '.proto'
  ];

  // Skip common non-code files
  const skipPatterns = [
    'node_modules/',
    '.git/',
    'dist/',
    'build/',
    '.next/',
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml'
  ];

  if (skipPatterns.some(pattern => path.includes(pattern))) {
    return false;
  }

  return codeExtensions.some(ext => path.endsWith(ext));
}

/**
 * Detect programming language from file path
 */
function detectLanguage(path: string): string {
  const ext = path.substring(path.lastIndexOf('.'));
  const languageMap: Record<string, string> = {
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.py': 'python',
    '.go': 'go',
    '.java': 'java',
    '.rb': 'ruby',
    '.css': 'css',
    '.scss': 'scss',
    '.html': 'html',
    '.vue': 'vue',
    '.c': 'c',
    '.cpp': 'cpp',
    '.h': 'c',
    '.hpp': 'cpp',
    '.rs': 'rust',
    '.swift': 'swift',
    '.kt': 'kotlin',
    '.php': 'php',
    '.sql': 'sql',
    '.graphql': 'graphql',
    '.proto': 'protobuf'
  };

  return languageMap[ext] || 'unknown';
}

/**
 * Split large file content into chunks for embedding
 */
function splitIntoChunks(content: string, maxLines: number = 500): string[] {
  const lines = content.split('\n');

  if (lines.length <= maxLines) {
    return [content];
  }

  const chunks: string[] = [];
  for (let i = 0; i < lines.length; i += maxLines) {
    const chunk = lines.slice(i, i + maxLines).join('\n');
    chunks.push(chunk);
  }

  return chunks;
}

/**
 * Index a file for RAG (automatic on write)
 */
async function indexFileForRAG(
  projectId: bigint,
  path: string,
  content: string,
  jobId: bigint
): Promise<void> {
  try {
    // Check if file should be indexed
    if (!shouldIndexFile(path)) {
      return;
    }

    // Don't index empty or very small files
    if (content.trim().length < 50) {
      return;
    }

    const { qdrantManager } = await import('../vector/qdrant-manager.js');

    // Split large files into chunks
    const chunks = splitIntoChunks(content, 500);

    // Prepare items for batch upsert
    const items = chunks.map((chunk, idx) => ({
      content: chunk,
      metadata: {
        sourcePath: path,
        sourceId: `${path}:chunk${idx}`,
        language: detectLanguage(path),
        timestamp: new Date().toISOString(),
        chunkIndex: idx,
        totalChunks: chunks.length
      }
    }));

    // Batch upsert to Qdrant
    await qdrantManager.batchUpsert(projectId, 'code', items);

    console.log(`[RAG Indexer] ✓ Indexed ${chunks.length} chunk(s) from ${path} (${content.length} bytes)`);

    // Log indexing to generation logs
    await logToolExecution(
      jobId,
      'auto_index',
      'info',
      `Indexed ${path} for RAG search (${chunks.length} chunks)`,
      { path, chunks: chunks.length, language: detectLanguage(path) }
    );
  } catch (error) {
    console.error(`[RAG Indexer] Failed to index ${path}:`, error);
    // Don't throw - indexing failures should not break file writes
  }
}

/**
 * Handle run_code tool - Execute code in sandbox runtime
 * NEW: Complete Daytona Process API coverage - codeRun() support
 */
async function handleCodeRun(
  input: { code: string; language: string; timeout?: number },
  workspaceId: bigint,
  jobId: bigint
): Promise<any> {
  const { code, language, timeout = 30 } = input;

  await logToolExecution(
    jobId,
    'run_code',
    'info',
    `Executing ${language} code (${code.length} bytes, timeout: ${timeout}s)`
  );

  try {
    console.log(`[Tool Handler] Executing ${language} code via Daytona SDK...`);
    const result = await daytonaManager.codeRun(workspaceId, code, undefined, timeout);

    await logToolExecution(
      jobId,
      'run_code',
      result.exitCode === 0 ? 'success' : 'warning',
      `Code executed: exit=${result.exitCode}, stdout=${result.stdout.length}b, stderr=${result.stderr.length}b`
    );

    console.log(`[Tool Handler] ✓ Code execution completed: exit=${result.exitCode}`);

    return {
      success: result.exitCode === 0,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      artifacts: result.artifacts,
      charts: result.artifacts?.charts || [],
      language,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Tool Handler] Code execution failed:`, errorMsg);

    await logToolExecution(jobId, 'run_code', 'error', `Code execution failed: ${errorMsg}`);

    return {
      success: false,
      exitCode: 1,
      stdout: '',
      stderr: errorMsg,
      error: errorMsg,
      language,
    };
  }
}

/**
 * Handle start_build tool - Start a comprehensive build with live tracking
 */
async function handleStartBuild(
  input: { metadata?: Record<string, any> },
  workspaceId: bigint,
  projectId: bigint,
  jobId: bigint
): Promise<any> {
  const { buildManager } = await import('../workspace/build-manager.js');

  // Create and start build
  const build = await buildManager.createBuild(projectId, workspaceId, input.metadata);

  // Start build process in background
  buildManager.startBuild(build.id).catch(err => {
    console.error(`[Build Tool] Build ${build.id} failed:`, err);
  });

  await updateJobProgress(jobId, `Started build ${build.id}`);

  return {
    success: true,
    build_id: build.id.toString(),
    status: build.status,
    phase: build.phase,
    message: 'Build started with comprehensive tracking'
  };
}

/**
 * Handle get_build_status tool - Get detailed build status
 */
async function handleGetBuildStatus(
  input: { build_id?: string; latest?: boolean },
  projectId: bigint,
  jobId: bigint
): Promise<any> {
  const { buildManager } = await import('../workspace/build-manager.js');

  if (input.latest) {
    // Get latest build for project
    const builds = await buildManager.listBuilds(projectId, 1);

    if (builds.length === 0) {
      return {
        found: false,
        message: 'No builds found for this project'
      };
    }

    const build = builds[0];
    const events = await buildManager.getBuildEvents(build.id, 20);

    return {
      found: true,
      build_id: build.id.toString(),
      status: build.status,
      phase: build.phase,
      current_step: build.current_step,
      progress: {
        current: build.total_steps ? Math.floor((events.length / (build.total_steps * 2)) * 100) : 0,
        total: 100
      },
      daytona_session_id: build.daytona_session_id,
      recent_events: events.slice(-5).map(e => ({
        type: e.event_type,
        phase: e.phase,
        message: e.message,
        timestamp: e.timestamp
      })),
      duration_ms: build.duration_ms,
      error_message: build.error_message
    };
  }

  if (!input.build_id) {
    throw new Error('Either build_id or latest=true must be provided');
  }

  const buildId = BigInt(input.build_id);
  const build = await buildManager.getBuild(buildId);
  const events = await buildManager.getBuildEvents(buildId, 50);

  return {
    found: true,
    build_id: build.id.toString(),
    status: build.status,
    phase: build.phase,
    current_step: build.current_step,
    progress: {
      current: build.total_steps ? Math.floor((events.length / (build.total_steps * 2)) * 100) : 0,
      total: 100
    },
    daytona_session_id: build.daytona_session_id,
    events: events.map(e => ({
      type: e.event_type,
      phase: e.phase,
      message: e.message,
      timestamp: e.timestamp
    })),
    install_logs: build.install_logs,
    build_logs: build.build_logs,
    live_output: build.live_output,
    duration_ms: build.duration_ms,
    error_message: build.error_message
  };
}

/**
 * Handle check_process_status tool - Check running processes in workspace
 */
async function handleCheckProcessStatus(
  input: { port?: number; process_name?: string },
  workspaceId: bigint,
  jobId: bigint
): Promise<any> {
  const workspace = await daytonaManager.getWorkspace(workspaceId);

  if (workspace.status !== 'running') {
    return {
      workspace_running: false,
      message: `Workspace is ${workspace.status}, not running`
    };
  }

  const results: any = {
    workspace_running: true,
    workspace_status: workspace.status,
    daytona_sandbox_id: workspace.daytona_sandbox_id
  };

  // Check for processes by port
  if (input.port) {
    try {
      const portCheck = await daytonaManager.executeCommand(
        workspaceId,
        `lsof -i :${input.port} 2>&1 || netstat -tuln | grep ${input.port} 2>&1 || ss -tuln | grep ${input.port} 2>&1`
      );

      results.port_status = {
        port: input.port,
        in_use: !portCheck.stdout.includes('No such file') && portCheck.stdout.trim().length > 0,
        details: portCheck.stdout.substring(0, 500)
      };
    } catch (error) {
      results.port_status = {
        port: input.port,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // Check for specific process
  if (input.process_name) {
    try {
      const processCheck = await daytonaManager.executeCommand(
        workspaceId,
        `ps aux | grep "${input.process_name}" | grep -v grep || echo "No matching processes"`
      );

      const processes = processCheck.stdout
        .split('\n')
        .filter(line => line.trim() && !line.includes('No matching processes'));

      results.process_status = {
        process_name: input.process_name,
        found: processes.length > 0,
        count: processes.length,
        processes: processes.slice(0, 5)
      };
    } catch (error) {
      results.process_status = {
        process_name: input.process_name,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // General process overview
  try {
    const psOutput = await daytonaManager.executeCommand(
      workspaceId,
      `ps aux --sort=-%cpu | head -10`
    );

    results.top_processes = psOutput.stdout.split('\n').slice(0, 11);
  } catch (error) {
    results.top_processes_error = error instanceof Error ? error.message : 'Unknown error';
  }

  return results;
}

/**
 * Handle get_live_logs tool - Get live logs from workspace or build
 */
async function handleGetLiveLogs(
  input: { source: 'workspace' | 'build'; build_id?: string; limit?: number },
  workspaceId: bigint,
  jobId: bigint
): Promise<any> {
  const { source, build_id, limit = 50 } = input;

  if (source === 'workspace') {
    const logs = await daytonaManager.getLogs(workspaceId, limit);

    return {
      source: 'workspace',
      logs: logs.map(log => ({
        level: log.log_level,
        message: log.message,
        timestamp: log.timestamp
      }))
    };
  }

  if (source === 'build') {
    if (!build_id) {
      throw new Error('build_id is required when source=build');
    }

    const { buildManager } = await import('../workspace/build-manager.js');
    const buildId = BigInt(build_id);
    const build = await buildManager.getBuild(buildId);
    const events = await buildManager.getBuildEvents(buildId, limit);

    return {
      source: 'build',
      build_id,
      build_status: build.status,
      build_phase: build.phase,
      current_step: build.current_step,
      live_output: build.live_output,
      install_logs: build.install_logs,
      build_logs: build.build_logs,
      events: events.map(e => ({
        type: e.event_type,
        phase: e.phase,
        message: e.message,
        timestamp: e.timestamp
      }))
    };
  }

  throw new Error('Invalid source: must be "workspace" or "build"');
}

/**
 * Handle run_dev_server tool - Start dev server with monitoring
 */
async function handleRunDevServer(
  input: { command: string; expected_port?: number },
  workspaceId: bigint,
  jobId: bigint
): Promise<any> {
  const { command, expected_port } = input;

  // Start dev server
  const result = await daytonaManager.startDevServer(workspaceId, command);

  if (!result.processStarted) {
    return {
      success: false,
      message: 'Failed to start dev server process'
    };
  }

  const port = result.detectedPort || expected_port || daytonaManager.detectPortFromCommand(command);

  // Wait for server to start
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Get preview URL
  const previewResult = await daytonaManager.getPreviewUrl(workspaceId, port);

  if (previewResult) {
    // Health check
    const isHealthy = await daytonaManager.healthCheckPreviewUrl(previewResult.url, 5);

    return {
      success: true,
      process_started: true,
      command,
      port: previewResult.port,
      preview_url: previewResult.url,
      health_check: isHealthy ? 'passed' : 'failed',
      message: isHealthy ? 'Dev server is running and responding' : 'Dev server started but not responding yet'
    };
  }

  return {
    success: true,
    process_started: true,
    command,
    port,
    preview_url: null,
    message: 'Dev server process started but preview URL not available yet'
  };
}

/**
 * ========================================
 * DAYTONA SANDBOX TOOL HANDLERS
 * ========================================
 * These handlers interact directly with the Daytona sandbox
 * for real-time operations during chat sessions
 */

/**
 * Handle daytona_execute_command tool - Execute command directly in Daytona sandbox
 */
async function handleDaytonaExecuteCommand(
  input: { command: string; cwd?: string },
  workspaceId: bigint,
  jobId: bigint
): Promise<any> {
  const { command, cwd } = input;

  console.log(`[Daytona Tool] Executing command in sandbox: ${command}`);

  const result = await daytonaManager.executeCommand(workspaceId, command);

  await updateJobProgress(jobId, `Executed: ${command}`);

  return {
    command,
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
    success: result.exitCode === 0,
    cwd: cwd || '/project'
  };
}

/**
 * Handle daytona_read_file tool - Read file directly from Daytona sandbox
 */
async function handleDaytonaReadFile(
  input: { path: string },
  workspaceId: bigint,
  jobId: bigint
): Promise<any> {
  const { path } = input;

  console.log(`[Daytona Tool] Reading file from sandbox: ${path}`);

  try {
    const content = await daytonaManager.readFile(workspaceId, path);

    return {
      success: true,
      path,
      content,
      source: 'daytona_sandbox'
    };
  } catch (error) {
    throw new Error(`Failed to read file ${path} from Daytona sandbox: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Handle daytona_write_file tool - Write file directly to Daytona sandbox
 */
async function handleDaytonaWriteFile(
  input: { path: string; content: string },
  workspaceId: bigint,
  jobId: bigint
): Promise<any> {
  const { path, content } = input;

  console.log(`[Daytona Tool] Writing file to sandbox: ${path} (${content.length} bytes)`);

  try {
    await daytonaManager.writeFile(workspaceId, path, content);

    await updateJobProgress(jobId, `Wrote ${path} to sandbox`);

    return {
      success: true,
      path,
      bytes: content.length,
      lines: content.split('\n').length,
      destination: 'daytona_sandbox'
    };
  } catch (error) {
    throw new Error(`Failed to write file ${path} to Daytona sandbox: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Handle daytona_list_files tool - List files in Daytona sandbox
 */
async function handleDaytonaListFiles(
  input: { path?: string; recursive?: boolean },
  workspaceId: bigint,
  jobId: bigint
): Promise<any> {
  const { path = '.', recursive = false } = input;

  console.log(`[Daytona Tool] Listing files in sandbox: ${path} (recursive: ${recursive})`);

  // Use ls or find command depending on recursive flag
  const command = recursive
    ? `find ${path} -type f 2>/dev/null || echo "Error: Directory not found"`
    : `ls -la ${path} 2>/dev/null || echo "Error: Directory not found"`;

  const result = await daytonaManager.executeCommand(workspaceId, command);

  if (result.stderr || result.stdout.includes('Error:')) {
    throw new Error(`Failed to list files in ${path}: ${result.stderr || result.stdout}`);
  }

  const files = result.stdout.split('\n').filter(f => f.trim());

  return {
    success: true,
    path,
    recursive,
    files,
    count: files.length
  };
}

/**
 * Handle daytona_get_preview_url tool - Get preview URL for running application
 */
async function handleDaytonaGetPreviewUrl(
  input: { port?: number },
  workspaceId: bigint,
  jobId: bigint
): Promise<any> {
  const { port = 3000 } = input;

  console.log(`[Daytona Tool] Getting preview URL for port ${port}`);

  try {
    const preview = await daytonaManager.getPreviewUrl(workspaceId, port);

    if (!preview) {
      return {
        success: false,
        message: `No preview URL available for port ${port}. The server may not be running yet.`
      };
    }

    // Health check the URL
    const isHealthy = await daytonaManager.healthCheckPreviewUrl(preview.url, 3);

    return {
      success: true,
      url: preview.url,
      port: preview.port,
      health_check: isHealthy ? 'passed' : 'failed',
      message: isHealthy
        ? 'Preview URL is accessible and responding'
        : 'Preview URL obtained but not responding yet (server may still be starting)'
    };
  } catch (error) {
    throw new Error(`Failed to get preview URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Handle daytona_git_clone tool - Clone a Git repository into Daytona sandbox
 */
async function handleDaytonaGitClone(
  input: { repo_url: string; destination?: string },
  workspaceId: bigint,
  jobId: bigint
): Promise<any> {
  const { repo_url, destination = '.' } = input;

  console.log(`[Daytona Tool] Cloning Git repo into sandbox: ${repo_url}`);

  await updateJobProgress(jobId, `Cloning ${repo_url}...`);

  const command = destination === '.'
    ? `git clone ${repo_url}`
    : `git clone ${repo_url} ${destination}`;

  const result = await daytonaManager.executeCommand(workspaceId, command);

  if (result.exitCode !== 0) {
    throw new Error(`Git clone failed: ${result.stderr || result.stdout}`);
  }

  await updateJobProgress(jobId, `Cloned ${repo_url}`);

  return {
    success: true,
    repo_url,
    destination,
    output: result.stdout,
    message: 'Repository cloned successfully'
  };
}

/**
 * Handle daytona_get_workspace_status tool - Get Daytona workspace status
 */
async function handleDaytonaGetWorkspaceStatus(
  input: Record<string, never>, // No input parameters
  workspaceId: bigint,
  jobId: bigint
): Promise<any> {
  console.log(`[Daytona Tool] Getting workspace status for workspace ${workspaceId}`);

  try {
    const workspace = await daytonaManager.getWorkspace(workspaceId);

    return {
      success: true,
      workspace_id: workspace.id.toString(),
      daytona_sandbox_id: workspace.daytona_sandbox_id,
      status: workspace.status,
      project_id: workspace.project_id.toString(),
      name: workspace.name,
      language: workspace.language,
      environment: workspace.environment || {},
      ports: workspace.ports || {},
      created_at: workspace.created_at,
      started_at: workspace.started_at,
      stopped_at: workspace.stopped_at,
      error_message: workspace.error_message
    };
  } catch (error) {
    throw new Error(`Failed to get workspace status: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * ========================================
 * WORKSPACE MANAGEMENT TOOL HANDLERS
 * ========================================
 * These handlers enable the AI agent to manage workspace lifecycle:
 * - Ensure workspace is running before operations
 * - Restart workspace for fresh environment
 * - Force rebuild when sandbox is corrupted
 */

/**
 * Handle ensure_workspace_running tool - Auto-start/recover workspace
 */
async function handleEnsureWorkspaceRunning(
  input: { wait_for_ready?: boolean },
  workspaceId: bigint,
  jobId: bigint
): Promise<any> {
  const { wait_for_ready = true } = input;

  console.log(`[Workspace Management] Ensuring workspace ${workspaceId} is running (wait: ${wait_for_ready})`);
  await updateJobProgress(jobId, 'Checking workspace status...');

  try {
    let workspace = await daytonaManager.getWorkspace(workspaceId);
    const initialStatus = workspace.status;
    const actions: string[] = [];

    console.log(`[Workspace Management] Current status: ${workspace.status}`);

    // If already running, return success immediately
    if (workspace.status === 'running') {
      console.log(`[Workspace Management] ✓ Workspace is already running`);
      return {
        success: true,
        status: 'running',
        was_already_running: true,
        initial_status: initialStatus,
        actions_taken: [],
        message: 'Workspace is running and ready'
      };
    }

    // If stopped, restart it
    if (workspace.status === 'stopped') {
      console.log(`[Workspace Management] Workspace is stopped, restarting...`);
      await updateJobProgress(jobId, 'Restarting stopped workspace...');
      actions.push('restarted_from_stopped');

      await daytonaManager.restartWorkspace(workspaceId);
      workspace = await daytonaManager.getWorkspace(workspaceId);

      console.log(`[Workspace Management] ✓ Restart initiated, new status: ${workspace.status}`);
    }

    // If errored, try to recover
    if (workspace.status === 'error') {
      console.log(`[Workspace Management] Workspace is in error state, attempting recovery...`);
      await updateJobProgress(jobId, 'Recovering errored workspace...');
      actions.push('recovered_from_error');

      try {
        await daytonaManager.restartWorkspace(workspaceId);
        workspace = await daytonaManager.getWorkspace(workspaceId);

        console.log(`[Workspace Management] ✓ Recovery initiated, new status: ${workspace.status}`);
      } catch (recoveryError) {
        const errorMsg = recoveryError instanceof Error ? recoveryError.message : 'Unknown error';
        console.error(`[Workspace Management] ✗ Recovery failed:`, errorMsg);

        return {
          success: false,
          status: 'error',
          initial_status: initialStatus,
          actions_taken: actions,
          error: errorMsg,
          message: `Workspace recovery failed: ${errorMsg}. Consider using force_rebuild_workspace if the problem persists.`,
          recommendation: 'force_rebuild'
        };
      }
    }

    // If wait_for_ready is true and workspace is starting, poll until running
    if (wait_for_ready && (workspace.status === 'starting' || workspace.status === 'pending')) {
      console.log(`[Workspace Management] Waiting for workspace to reach running status...`);
      await updateJobProgress(jobId, 'Waiting for workspace to start...');
      actions.push('waited_for_ready');

      const MAX_WAIT_SECONDS = 60;
      const POLL_INTERVAL_MS = 2000;
      const maxAttempts = Math.floor((MAX_WAIT_SECONDS * 1000) / POLL_INTERVAL_MS);
      let attempts = 0;

      while (attempts < maxAttempts) {
        workspace = await daytonaManager.getWorkspace(workspaceId);

        if (workspace.status === 'running') {
          console.log(`[Workspace Management] ✓ Workspace reached running status after ${attempts * 2} seconds`);
          break;
        }

        if (workspace.status === 'error' || workspace.status === 'deleted') {
          const errorMsg = workspace.error_message || 'Workspace failed to start';
          console.error(`[Workspace Management] ✗ Workspace entered error state: ${errorMsg}`);

          return {
            success: false,
            status: workspace.status,
            initial_status: initialStatus,
            actions_taken: actions,
            error: errorMsg,
            message: `Workspace failed to start: ${errorMsg}`,
            recommendation: 'force_rebuild'
          };
        }

        attempts++;
        console.log(`[Workspace Management] Polling... (${attempts}/${maxAttempts}, status: ${workspace.status})`);
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
      }

      if (workspace.status !== 'running') {
        console.warn(`[Workspace Management] ⚠ Timeout waiting for workspace (current status: ${workspace.status})`);

        return {
          success: false,
          status: workspace.status,
          initial_status: initialStatus,
          actions_taken: actions,
          error: `Workspace did not reach running status after ${MAX_WAIT_SECONDS} seconds`,
          message: `Workspace is still ${workspace.status} after ${MAX_WAIT_SECONDS} seconds. It may need more time or may be stuck.`,
          recommendation: 'retry_or_rebuild'
        };
      }
    }

    console.log(`[Workspace Management] ✓ Workspace is ready (status: ${workspace.status})`);
    await updateJobProgress(jobId, 'Workspace is ready');

    return {
      success: true,
      status: workspace.status,
      was_already_running: false,
      initial_status: initialStatus,
      actions_taken: actions,
      message: `Workspace is now ${workspace.status}. Actions taken: ${actions.join(', ') || 'none'}`
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Workspace Management] Error ensuring workspace running:`, errorMsg);

    return {
      success: false,
      status: 'unknown',
      error: errorMsg,
      message: `Failed to ensure workspace is running: ${errorMsg}`,
      recommendation: 'check_logs_or_rebuild'
    };
  }
}

/**
 * Handle restart_workspace tool - Explicitly restart workspace
 */
async function handleRestartWorkspace(
  input: { reason?: string },
  workspaceId: bigint,
  projectId: bigint,
  jobId: bigint
): Promise<any> {
  const { reason = 'Agent requested explicit restart' } = input;

  console.log(`[Workspace Management] Restarting workspace ${workspaceId}. Reason: ${reason}`);
  await updateJobProgress(jobId, `Restarting workspace: ${reason}`);
  await logToolExecution(jobId, 'restart_workspace', 'info', `Restarting workspace: ${reason}`);

  try {
    const workspace = await daytonaManager.getWorkspace(workspaceId);
    const initialStatus = workspace.status;

    console.log(`[Workspace Management] Current status: ${initialStatus}`);

    // Call restart (handles both running and stopped states)
    await daytonaManager.restartWorkspace(workspaceId);

    console.log(`[Workspace Management] ✓ Restart initiated`);

    // Wait for restart to complete (up to 30 seconds)
    const MAX_WAIT_SECONDS = 30;
    const POLL_INTERVAL_MS = 2000;
    const maxAttempts = Math.floor((MAX_WAIT_SECONDS * 1000) / POLL_INTERVAL_MS);
    let attempts = 0;
    let newWorkspace = await daytonaManager.getWorkspace(workspaceId);

    while (attempts < maxAttempts && newWorkspace.status !== 'running') {
      if (newWorkspace.status === 'error') {
        const errorMsg = newWorkspace.error_message || 'Workspace restart failed';
        console.error(`[Workspace Management] ✗ Restart failed: ${errorMsg}`);

        return {
          success: false,
          status: newWorkspace.status,
          initial_status: initialStatus,
          error: errorMsg,
          message: `Workspace restart failed: ${errorMsg}. Consider using force_rebuild_workspace.`,
          recommendation: 'force_rebuild'
        };
      }

      attempts++;
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
      newWorkspace = await daytonaManager.getWorkspace(workspaceId);
    }

    console.log(`[Workspace Management] ✓ Restart completed (status: ${newWorkspace.status})`);
    await updateJobProgress(jobId, 'Workspace restarted successfully');

    return {
      success: true,
      status: newWorkspace.status,
      initial_status: initialStatus,
      reason,
      message: `Workspace restarted successfully. Previous status: ${initialStatus}, current status: ${newWorkspace.status}`,
      workspace_id: workspaceId.toString(),
      daytona_sandbox_id: newWorkspace.daytona_sandbox_id
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Workspace Management] Restart failed:`, errorMsg);

    await logToolExecution(jobId, 'restart_workspace', 'error', `Restart failed: ${errorMsg}`);

    return {
      success: false,
      status: 'error',
      error: errorMsg,
      message: `Failed to restart workspace: ${errorMsg}`,
      recommendation: 'force_rebuild'
    };
  }
}

/**
 * Handle force_rebuild_workspace tool - DESTRUCTIVE: Rebuild workspace from scratch
 */
async function handleForceRebuildWorkspace(
  input: { confirm: boolean; reason: string },
  workspaceId: bigint,
  projectId: bigint,
  jobId: bigint
): Promise<any> {
  const { confirm, reason } = input;

  // Safety check: require explicit confirmation
  if (!confirm) {
    return {
      success: false,
      error: 'Confirmation required',
      message: 'Force rebuild requires confirm: true. This operation is destructive and will terminate all running processes.'
    };
  }

  console.log(`[Workspace Management] 🔥 FORCE REBUILD requested for project ${projectId}`);
  console.log(`[Workspace Management] Reason: ${reason}`);
  await updateJobProgress(jobId, `Force rebuilding workspace: ${reason}`);
  await logToolExecution(jobId, 'force_rebuild_workspace', 'warning', `Force rebuild initiated: ${reason}`);

  try {
    // Get current workspace info
    const oldWorkspace = await daytonaManager.getWorkspace(workspaceId);
    console.log(`[Workspace Management] Current workspace: ${oldWorkspace.name} (status: ${oldWorkspace.status})`);

    // Step 1: Delete existing workspace
    console.log(`[Workspace Management] STEP 1: Deleting existing workspace...`);
    await updateJobProgress(jobId, 'Deleting existing workspace...');

    try {
      await daytonaManager.deleteWorkspace(workspaceId);
      console.log(`[Workspace Management] ✓ Workspace deleted`);
    } catch (deleteError) {
      console.warn(`[Workspace Management] Warning during delete:`, deleteError);
      // Continue even if delete fails
    }

    // Step 2: Create new workspace with same config
    console.log(`[Workspace Management] STEP 2: Creating new workspace...`);
    await updateJobProgress(jobId, 'Creating new workspace from scratch...');

    const newWorkspace = await daytonaManager.createWorkspace(
      projectId,
      oldWorkspace.name,
      {
        language: oldWorkspace.language,
        environment: oldWorkspace.environment || undefined,
        autoStopInterval: oldWorkspace.auto_stop_interval || 60,
        autoArchiveInterval: oldWorkspace.auto_archive_interval || 24 * 60,
        ephemeral: oldWorkspace.ephemeral || false
      }
    );

    console.log(`[Workspace Management] ✓ New workspace created: ${newWorkspace.id}`);

    // Step 3: Wait for workspace to be running
    console.log(`[Workspace Management] STEP 3: Waiting for workspace to be ready...`);
    await updateJobProgress(jobId, 'Waiting for new workspace to start...');

    const MAX_WAIT_SECONDS = 60;
    const POLL_INTERVAL_MS = 2000;
    const maxAttempts = Math.floor((MAX_WAIT_SECONDS * 1000) / POLL_INTERVAL_MS);
    let attempts = 0;
    let workspace = await daytonaManager.getWorkspace(newWorkspace.id);

    while (attempts < maxAttempts && workspace.status !== 'running') {
      if (workspace.status === 'error') {
        const errorMsg = workspace.error_message || 'New workspace failed to start';
        console.error(`[Workspace Management] ✗ New workspace failed:`, errorMsg);

        return {
          success: false,
          error: errorMsg,
          message: `Force rebuild failed: New workspace could not start. ${errorMsg}`,
          old_workspace_id: workspaceId.toString(),
          new_workspace_id: newWorkspace.id.toString()
        };
      }

      attempts++;
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
      workspace = await daytonaManager.getWorkspace(newWorkspace.id);
    }

    if (workspace.status !== 'running') {
      console.warn(`[Workspace Management] ⚠ New workspace not running after ${MAX_WAIT_SECONDS}s (status: ${workspace.status})`);

      return {
        success: false,
        error: 'Timeout waiting for new workspace',
        message: `New workspace created but did not reach running status after ${MAX_WAIT_SECONDS} seconds. Current status: ${workspace.status}`,
        old_workspace_id: workspaceId.toString(),
        new_workspace_id: newWorkspace.id.toString(),
        status: workspace.status
      };
    }

    console.log(`[Workspace Management] ✓ New workspace is running`);

    // Step 4: Deploy files from VFS to new workspace
    console.log(`[Workspace Management] STEP 4: Deploying files from VFS backup...`);
    await updateJobProgress(jobId, 'Restoring files from VFS backup...');

    try {
      const deployResult = await daytonaManager.deployProjectFromVFS(newWorkspace.id, projectId);
      console.log(`[Workspace Management] ✓ Deployed ${deployResult.filesDeployed} files from VFS`);

      await updateJobProgress(jobId, 'Force rebuild completed successfully');
      await logToolExecution(
        jobId,
        'force_rebuild_workspace',
        'info',
        `Force rebuild completed: ${deployResult.filesDeployed} files restored`
      );

      return {
        success: true,
        message: `Workspace rebuilt successfully. Deployed ${deployResult.filesDeployed} files from VFS backup. The workspace is now running fresh.`,
        reason,
        old_workspace_id: workspaceId.toString(),
        new_workspace_id: newWorkspace.id.toString(),
        status: 'running',
        files_restored: deployResult.filesDeployed,
        recommendation: 'You may need to reinstall dependencies (npm install, pip install, etc.)'
      };
    } catch (deployError) {
      const deployErrorMsg = deployError instanceof Error ? deployError.message : 'Unknown error';
      console.error(`[Workspace Management] Failed to deploy files:`, deployErrorMsg);

      return {
        success: false,
        error: deployErrorMsg,
        message: `Workspace rebuilt but file deployment failed: ${deployErrorMsg}. The workspace is running but empty.`,
        old_workspace_id: workspaceId.toString(),
        new_workspace_id: newWorkspace.id.toString(),
        status: 'running',
        recommendation: 'You can manually recreate files or check the VFS backup'
      };
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Workspace Management] Force rebuild failed:`, errorMsg);

    await logToolExecution(jobId, 'force_rebuild_workspace', 'error', `Force rebuild failed: ${errorMsg}`);

    return {
      success: false,
      error: errorMsg,
      message: `Force rebuild failed: ${errorMsg}`,
      recommendation: 'Check workspace configuration and try again'
    };
  }
}

// ============================================================================
// NEW TOOL HANDLERS - Git, File Editing, Package Management
// ============================================================================

/**
 * Handle edit_file tool - Targeted file editing
 */
async function handleEditFile(
  input: { path: string; old_text: string; new_text: string },
  workspaceId: bigint,
  projectId: bigint,
  jobId: bigint
): Promise<any> {
  const { path, old_text, new_text } = input;

  await logToolExecution(jobId, 'edit_file', 'info', `Editing file: ${path}`);

  try {
    // Read current file content
    const buffer = await gridfs.readFile(projectId, path);
    const content = buffer.toString('utf-8');

    // Check if old_text exists
    if (!content.includes(old_text)) {
      return {
        success: false,
        error: `Text not found in file: "${old_text.substring(0, 100)}${old_text.length > 100 ? '...' : ''}"`,
        message: 'The old_text was not found in the file. Make sure it matches exactly including whitespace.'
      };
    }

    // Replace text
    const newContent = content.replace(old_text, new_text);

    // Write back to file
    await gridfs.writeFile(projectId, path, Buffer.from(newContent), 'text/plain');

    await logToolExecution(jobId, 'edit_file', 'success', `Successfully edited ${path}`);

    return {
      success: true,
      path,
      changes: {
        removed: old_text.split('\n').length,
        added: new_text.split('\n').length
      },
      message: `Successfully edited ${path}`
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    await logToolExecution(jobId, 'edit_file', 'error', `Failed to edit file: ${errorMsg}`);

    return {
      success: false,
      error: errorMsg,
      path
    };
  }
}

/**
 * Handle git_status tool
 */
async function handleGitStatus(
  input: Record<string, never>,
  projectId: bigint,
  jobId: bigint
): Promise<any> {
  await logToolExecution(jobId, 'git_status', 'info', 'Getting git status');

  try {
    const git = createGitManager(projectId);

    // Sync VFS files to git working directory
    await git.syncFromVFS(projectId);

    // Get status (this will use simple-git's status method)
    const status = await (git as any).git.status();

    return {
      success: true,
      modified: status.modified,
      created: status.created,
      deleted: status.deleted,
      not_added: status.not_added,
      conflicted: status.conflicted,
      current_branch: status.current,
      tracking: status.tracking,
      ahead: status.ahead,
      behind: status.behind
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    await logToolExecution(jobId, 'git_status', 'error', `Git status failed: ${errorMsg}`);

    return {
      success: false,
      error: errorMsg
    };
  }
}

/**
 * Handle git_commit tool
 */
async function handleGitCommit(
  input: { message: string },
  projectId: bigint,
  jobId: bigint
): Promise<any> {
  const { message } = input;

  await logToolExecution(jobId, 'git_commit', 'info', `Creating commit: ${message}`);

  try {
    const git = createGitManager(projectId);

    // Commit with auto-sync
    const commit = await git.commit(projectId, message, 'Vaporform Agent', 'agent@vaporform.dev');

    await logToolExecution(jobId, 'git_commit', 'success', `Created commit: ${commit.hash}`);

    return {
      success: true,
      commit_hash: commit.hash,
      message: commit.message,
      author: commit.author_name,
      files_changed: commit.files_changed,
      timestamp: commit.timestamp
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    await logToolExecution(jobId, 'git_commit', 'error', `Commit failed: ${errorMsg}`);

    return {
      success: false,
      error: errorMsg
    };
  }
}

/**
 * Handle git_log tool
 */
async function handleGitLog(
  input: { limit?: number },
  projectId: bigint,
  jobId: bigint
): Promise<any> {
  const { limit = 10 } = input;

  await logToolExecution(jobId, 'git_log', 'info', `Getting last ${limit} commits`);

  try {
    // Query commits from database
    const commits = await db.query<{
      commit_hash: string;
      author_name: string;
      author_email: string;
      message: string;
      timestamp: Date;
      files_changed: number;
    }>`
      SELECT commit_hash, author_name, author_email, message, timestamp, files_changed
      FROM git_commits
      WHERE project_id = ${projectId}
      ORDER BY timestamp DESC
      LIMIT ${limit}
    `;

    return {
      success: true,
      commits: commits.map(c => ({
        hash: c.commit_hash,
        author: `${c.author_name} <${c.author_email}>`,
        message: c.message,
        timestamp: c.timestamp.toISOString(),
        files_changed: c.files_changed
      })),
      count: commits.length
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    await logToolExecution(jobId, 'git_log', 'error', `Git log failed: ${errorMsg}`);

    return {
      success: false,
      error: errorMsg
    };
  }
}

/**
 * Handle git_diff tool
 */
async function handleGitDiff(
  input: { path?: string },
  projectId: bigint,
  jobId: bigint
): Promise<any> {
  const { path } = input;

  await logToolExecution(jobId, 'git_diff', 'info', `Getting diff${path ? ` for ${path}` : ''}`);

  try {
    const git = createGitManager(projectId);

    // Sync VFS to git working directory
    await git.syncFromVFS(projectId);

    // Get diff using simple-git
    const diff = await (git as any).git.diff(path ? [path] : []);

    return {
      success: true,
      diff,
      path: path || 'all files',
      has_changes: diff.length > 0
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    await logToolExecution(jobId, 'git_diff', 'error', `Git diff failed: ${errorMsg}`);

    return {
      success: false,
      error: errorMsg
    };
  }
}

/**
 * Handle install_package tool
 */
async function handleInstallPackage(
  input: { package: string; dev?: boolean; version?: string },
  workspaceId: bigint,
  projectId: bigint,
  jobId: bigint
): Promise<any> {
  const { package: packageName, dev = false, version } = input;
  const fullPackage = version ? `${packageName}@${version}` : packageName;

  await logToolExecution(jobId, 'install_package', 'info', `Installing ${fullPackage}${dev ? ' (dev)' : ''}`);

  try {
    // Detect package manager
    const packageManager = await detectPackageManager(workspaceId, projectId);

    // Build install command
    let command: string;
    switch (packageManager) {
      case 'pnpm':
        command = `pnpm add ${dev ? '-D' : ''} ${fullPackage}`;
        break;
      case 'yarn':
        command = `yarn add ${dev ? '-D' : ''} ${fullPackage}`;
        break;
      case 'npm':
      default:
        command = `npm install ${dev ? '--save-dev' : '--save'} ${fullPackage}`;
        break;
    }

    // Execute install command
    const result = await daytonaManager.executeCommand(workspaceId, command);

    if (result.exitCode !== 0) {
      return {
        success: false,
        package: fullPackage,
        error: result.stderr || result.stdout,
        package_manager: packageManager
      };
    }

    await logToolExecution(jobId, 'install_package', 'success', `Installed ${fullPackage}`);

    return {
      success: true,
      package: fullPackage,
      dev,
      package_manager: packageManager,
      message: `Successfully installed ${fullPackage} using ${packageManager}`
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    await logToolExecution(jobId, 'install_package', 'error', `Install failed: ${errorMsg}`);

    return {
      success: false,
      package: fullPackage,
      error: errorMsg
    };
  }
}

/**
 * Handle remove_package tool
 */
async function handleRemovePackage(
  input: { package: string },
  workspaceId: bigint,
  projectId: bigint,
  jobId: bigint
): Promise<any> {
  const { package: packageName } = input;

  await logToolExecution(jobId, 'remove_package', 'info', `Removing ${packageName}`);

  try {
    // Detect package manager
    const packageManager = await detectPackageManager(workspaceId, projectId);

    // Build remove command
    let command: string;
    switch (packageManager) {
      case 'pnpm':
        command = `pnpm remove ${packageName}`;
        break;
      case 'yarn':
        command = `yarn remove ${packageName}`;
        break;
      case 'npm':
      default:
        command = `npm uninstall ${packageName}`;
        break;
    }

    // Execute remove command
    const result = await daytonaManager.executeCommand(workspaceId, command);

    if (result.exitCode !== 0) {
      return {
        success: false,
        package: packageName,
        error: result.stderr || result.stdout,
        package_manager: packageManager
      };
    }

    await logToolExecution(jobId, 'remove_package', 'success', `Removed ${packageName}`);

    return {
      success: true,
      package: packageName,
      package_manager: packageManager,
      message: `Successfully removed ${packageName} using ${packageManager}`
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    await logToolExecution(jobId, 'remove_package', 'error', `Remove failed: ${errorMsg}`);

    return {
      success: false,
      package: packageName,
      error: errorMsg
    };
  }
}

/**
 * Detect package manager from project files
 */
async function detectPackageManager(workspaceId: bigint, projectId: bigint): Promise<'npm' | 'yarn' | 'pnpm'> {
  try {
    // Check for lock files in VFS
    const files = await gridfs.listDirectory(projectId, '/');
    const fileNames = files.map(f => f.path);

    if (fileNames.includes('/pnpm-lock.yaml')) {
      return 'pnpm';
    }
    if (fileNames.includes('/yarn.lock')) {
      return 'yarn';
    }
    return 'npm'; // Default to npm
  } catch {
    return 'npm'; // Default to npm on error
  }
}
