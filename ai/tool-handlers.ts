/**
 * Agent Tool Execution Handlers
 * Routes AI agent tool calls to workspace operations
 */

import { daytonaManager } from '../workspace/daytona-manager.js';
import { db } from '../projects/db.js';

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
        result = await handleReadFile(toolUse.input, workspaceId, jobId);
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

      case 'ask_followup_question':
        result = await handleAskFollowup(toolUse.input, jobId);
        break;

      case 'attempt_completion':
        result = await handleAttemptCompletion(toolUse.input, projectId, workspaceId, jobId);
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
 * NOW WRITES TO VFS FIRST (not directly to Daytona)
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

  // ✓ CHANGED: Write to VFS FIRST (not directly to Daytona sandbox)
  const { getMimeType } = await import('../shared/utils.js');
  const { gridfs } = await import('../vfs/gridfs.js');

  const metadata = await gridfs.writeFile(
    projectId,
    path,
    Buffer.from(content, 'utf-8'),
    getMimeType(path)
  );

  console.log(`[Tool Handler] Wrote file to VFS: ${path} (${content.length} bytes)`);

  // Update progress
  await updateJobProgress(jobId, `Created ${path}`);

  return {
    success: true,
    path,
    bytes: content.length,
    lines: content.split('\n').length,
    vfs_file_id: metadata.gridfs_file_id
  };
}

/**
 * Handle read_file tool
 */
async function handleReadFile(
  input: { path: string; line_range?: { start: number; end: number } },
  workspaceId: bigint,
  jobId: bigint
): Promise<any> {
  const { path, line_range } = input;

  const content = await daytonaManager.readFile(workspaceId, path);

  if (line_range) {
    const lines = content.split('\n');
    const selectedLines = lines.slice(line_range.start - 1, line_range.end);
    return {
      path,
      content: selectedLines.join('\n'),
      line_range
    };
  }

  return {
    path,
    content
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
 * Starts dev server, extracts preview URL, and marks project as complete
 */
async function handleAttemptCompletion(
  input: { result: string; command?: string },
  projectId: bigint,
  workspaceId: bigint,
  jobId: bigint
): Promise<any> {
  const { result, command } = input;

  console.log(`[Completion] Project generation completed: ${result}`);
  console.log(`[Completion] ========== STARTING AUTOMATIC DEPLOYMENT PIPELINE ==========`);

  let previewUrl: string | null = null;
  let deploymentStatus = 'completed';

  try {
    // STEP 1: Deploy files from VFS to Daytona sandbox
    console.log(`[Completion] STEP 1: Deploying files from VFS to Daytona sandbox...`);
    await updateJobProgress(jobId, 'Deploying files to workspace...');

    const deployResult = await daytonaManager.deployProjectFromVFS(workspaceId, projectId);
    console.log(`[Completion] ✓ Deployed ${deployResult.filesDeployed} files from VFS to Daytona`);
    await logToolExecution(
      jobId,
      'attempt_completion',
      'info',
      `Deployed ${deployResult.filesDeployed} files from VFS to sandbox`
    );

    // STEP 2: Detect technology stack
    console.log(`[Completion] STEP 2: Detecting technology stack...`);
    await updateJobProgress(jobId, 'Detecting tech stack...');

    const techStack = await daytonaManager.detectTechStack(workspaceId);
    console.log(`[Completion] ✓ Detected: ${techStack.language} / ${techStack.framework} / ${techStack.packageManager}`);
    await logToolExecution(
      jobId,
      'attempt_completion',
      'info',
      `Detected tech stack: ${techStack.language} with ${techStack.framework}`
    );

    // STEP 3: Install dependencies
    console.log(`[Completion] STEP 3: Installing dependencies with ${techStack.packageManager}...`);
    await updateJobProgress(jobId, 'Installing dependencies...');

    try {
      const installResult = await daytonaManager.installDependencies(workspaceId, techStack);
      if (installResult.success) {
        console.log(`[Completion] ✓ Dependencies installed successfully`);
        await logToolExecution(jobId, 'attempt_completion', 'info', 'Dependencies installed successfully');
      } else {
        console.log(`[Completion] ⚠ Dependency installation failed: ${installResult.error}`);
        await logToolExecution(
          jobId,
          'attempt_completion',
          'warning',
          `Dependency installation failed: ${installResult.error}`
        );
      }
    } catch (installError) {
      console.error(`[Completion] Error installing dependencies:`, installError);
      await logToolExecution(
        jobId,
        'attempt_completion',
        'warning',
        `Dependency installation error: ${installError instanceof Error ? installError.message : 'Unknown error'}`
      );
    }

    // STEP 4: Build project (if needed)
    console.log(`[Completion] STEP 4: Building project...`);
    await updateJobProgress(jobId, 'Building project...');

    try {
      const buildResult = await daytonaManager.buildProjectWithTechStack(workspaceId, techStack);
      if (buildResult.success) {
        console.log(`[Completion] ✓ Build completed successfully`);
        await logToolExecution(jobId, 'attempt_completion', 'info', 'Project built successfully');
      } else {
        console.log(`[Completion] ⚠ Build failed or not required: ${buildResult.message}`);
        await logToolExecution(
          jobId,
          'attempt_completion',
          'info',
          `Build: ${buildResult.message}`
        );
      }
    } catch (buildError) {
      console.error(`[Completion] Error building project:`, buildError);
      await logToolExecution(
        jobId,
        'attempt_completion',
        'warning',
        `Build error: ${buildError instanceof Error ? buildError.message : 'Unknown error'}`
      );
    }
  } catch (deployError) {
    console.error(`[Completion] Deployment pipeline error:`, deployError);
    await logToolExecution(
      jobId,
      'attempt_completion',
      'error',
      `Deployment error: ${deployError instanceof Error ? deployError.message : 'Unknown error'}`
    );
    deploymentStatus = 'failed';
  }

  // STEP 5: Start dev server and get preview URL
  // Determine the command to use (provided by AI or inferred)
  let devCommand = command;

  try {
    // If no command provided, try to infer from package.json
    if (!devCommand) {
      console.log(`[Completion] STEP 5: No command provided, attempting to infer from package.json`);
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
      console.log(`[Completion] STEP 6: Starting dev server with command: ${devCommand}`);
      console.log(`[Completion] Starting dev server with command: ${devCommand}`);
      await updateJobProgress(jobId, 'Starting development server...');

      try {
        await logToolExecution(jobId, 'attempt_completion', 'info', `Starting dev server: ${devCommand}`);

        // Detect expected port from command
        const expectedPort = daytonaManager.detectPortFromCommand(devCommand);
        console.log(`[Completion] Expected port: ${expectedPort}`);

        // Start the dev server in background (non-blocking)
        const serverResult = await daytonaManager.startDevServer(workspaceId, devCommand);

        if (serverResult.processStarted) {
          console.log(`[Completion] ✓ Dev server process started`);

          // Use detected port if available, otherwise use expected port
          const actualPort = serverResult.detectedPort || expectedPort;
          console.log(`[Completion] Using port ${actualPort} for preview URL`);

          // Wait additional time for server to fully initialize
          console.log(`[Completion] Waiting 3 seconds for server initialization...`);
          await new Promise(resolve => setTimeout(resolve, 3000));

          // Get the preview URL
          await updateJobProgress(jobId, 'Extracting preview URL...');
          const preview = await daytonaManager.getPreviewUrl(workspaceId, actualPort);

          if (preview) {
            previewUrl = preview.url;
            console.log(`[Completion] ✓ Got preview URL: ${previewUrl}`);

            // Health check the preview URL
            await updateJobProgress(jobId, 'Verifying server health...');
            const isHealthy = await daytonaManager.healthCheckPreviewUrl(previewUrl, 8); // Extended attempts

            if (isHealthy) {
              console.log(`[Completion] ✓ Server health check passed`);
              await logToolExecution(jobId, 'attempt_completion', 'info', `Preview URL verified and responding: ${previewUrl}`);
              deploymentStatus = 'deployed';
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
          }
        } else {
          console.log(`[Completion] ⚠ Dev server process failed to start`);
          await logToolExecution(jobId, 'attempt_completion', 'warning', 'Dev server process failed to start');
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
      }
    } else {
      console.log(`[Completion] No command provided, skipping dev server startup`);
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
  try {
    await db.transaction(async (tx) => {
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
    });
  } catch (txError) {
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
      ${metadata ? JSON.stringify(metadata) : null}
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
