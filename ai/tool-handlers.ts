
/**
 * Agent Tool Execution Handlers
 * Routes AI agent tool calls to workspace operations
 */

import { daytonaManager } from '../workspace/daytona-manager.js';
import { db } from '../projects/db.js';
import { logToolExecution } from './tool-utils.js';

import * as FileTools from './file-tools.js';
import * as CommandTools from './command-tools.js';
import * as GitTools from './git-tools.js';
import * as DaytonaTools from './daytona-tools.js';

export interface ToolExecutionContext {
  workspaceId: bigint;
  projectId: bigint;
  jobId: bigint;
  iteration?: number;
  userId?: string;
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
  const { workspaceId, projectId, jobId, iteration } = context;
  const startTime = Date.now();

  try {
    console.log(`[Tool ${jobId}] ========== EXECUTING: ${toolUse.name} ==========`);
    if (iteration !== undefined) console.log(`[Tool ${jobId}] Iteration: ${iteration}`);
    console.log(`[Tool ${jobId}] Input:`, JSON.stringify(toolUse.input, null, 2).substring(0, 500));

    await logToolExecution(
      jobId,
      toolUse.name,
      'info',
      `Executing ${toolUse.name}`,
      { phase: 'start', iteration, input: toolUse.input, timestamp: new Date().toISOString() }
    );

    let result: any;

    switch (toolUse.name) {
      // File Tools (Daytona only - GridFS tools removed)
      case 'edit_file':
        result = await FileTools.handleEditFile(toolUse.input, workspaceId, projectId, jobId);
        break;
      case 'search_files':
        result = await FileTools.handleSearchFiles(toolUse.input, workspaceId, jobId);
        break;
      case 'daytona_read_file':
        result = await FileTools.handleDaytonaReadFile(toolUse.input, workspaceId, jobId);
        break;
      case 'daytona_write_file':
        result = await FileTools.handleDaytonaWriteFile(toolUse.input, workspaceId, jobId);
        break;
      case 'daytona_list_files':
        result = await FileTools.handleDaytonaListFiles(toolUse.input, workspaceId, jobId);
        break;

      // Git Tools
      case 'git_status':
        result = await GitTools.handleGitStatus(toolUse.input, projectId, jobId);
        break;
      case 'git_commit':
        result = await GitTools.handleGitCommit(toolUse.input, projectId, jobId);
        break;
      case 'git_undo':
        result = await GitTools.handleGitUndo(toolUse.input, projectId, jobId);
        break;
      case 'git_redo':
        result = await GitTools.handleGitRedo(toolUse.input, projectId, jobId);
        break;
      case 'git_log':
        result = await GitTools.handleGitLog(toolUse.input, projectId, jobId);
        break;
      case 'git_diff':
        result = await GitTools.handleGitDiff(toolUse.input, projectId, jobId);
        break;
      case 'daytona_git_clone':
        result = await GitTools.handleDaytonaGitClone(toolUse.input, workspaceId, jobId);
        break;

      // Command & Project Tools
      case 'execute_command':
        result = await CommandTools.handleExecuteCommand(toolUse.input, workspaceId, jobId);
        break;
      case 'daytona_execute_command':
        result = await CommandTools.handleDaytonaExecuteCommand(toolUse.input, workspaceId, jobId);
        break;
      case 'run_code':
        result = await CommandTools.handleRunCode(toolUse.input, workspaceId, jobId);
        break;
      case 'install_package':
        result = await CommandTools.handleInstallPackage(toolUse.input, workspaceId, projectId, jobId);
        break;
      case 'remove_package':
        result = await CommandTools.handleRemovePackage(toolUse.input, workspaceId, projectId, jobId);
        break;
      case 'initialize_project_environment':
        result = await CommandTools.handleInitializeProjectEnvironment(toolUse.input, projectId, jobId);
        break;
      case 'attempt_completion':
        result = await CommandTools.handleAttemptCompletion(toolUse.input, projectId, workspaceId, jobId);
        break;
      case 'run_dev_server':
        result = await CommandTools.handleRunDevServer(toolUse.input, workspaceId, jobId);
        break;
      case 'check_process_status':
        result = await CommandTools.handleCheckProcessStatus(toolUse.input, workspaceId, jobId);
        break;
      case 'get_live_logs':
        result = await CommandTools.handleGetLiveLogs(toolUse.input, workspaceId, jobId);
        break;
      case 'ensure_workspace_running':
        result = await CommandTools.handleEnsureWorkspaceRunning(toolUse.input, workspaceId, jobId);
        break;
      case 'restart_workspace':
        result = await CommandTools.handleRestartWorkspace(toolUse.input, workspaceId, projectId, jobId);
        break;
      case 'force_rebuild_workspace':
        result = await CommandTools.handleForceRebuildWorkspace(toolUse.input, workspaceId, projectId, jobId);
        break;
      case 'start_build':
        result = await CommandTools.handleStartBuild(toolUse.input, workspaceId, projectId, jobId);
        break;
      case 'get_build_status':
        result = await CommandTools.handleGetBuildStatus(toolUse.input, projectId, jobId);
        break;
      case 'ask_followup_question':
        result = await CommandTools.handleAskFollowup(toolUse.input, jobId);
        break;
      case 'daytona_get_preview_url':
        result = await CommandTools.handleDaytonaGetPreviewUrl(toolUse.input, workspaceId, jobId);
        break;
      case 'daytona_set_preview_port':
        result = await CommandTools.handleSetPreviewPort(toolUse.input, workspaceId, jobId);
        break;
      case 'daytona_get_workspace_status':
        result = await CommandTools.handleDaytonaGetWorkspaceStatus(toolUse.input, workspaceId, jobId);
        break;
      case 'daytona_get_workspace_metadata':
        result = await DaytonaTools.executeDaytonaTool('daytona_get_workspace_metadata', toolUse.input, context.projectId);
        break;
      case 'daytona_create_session':
        result = await DaytonaTools.executeDaytonaTool('daytona_create_session', toolUse.input, context.projectId);
        break;
      case 'daytona_session_exec':
        result = await DaytonaTools.executeDaytonaTool('daytona_session_exec', toolUse.input, context.projectId);
        break;
      case 'daytona_get_session':
        result = await DaytonaTools.executeDaytonaTool('daytona_get_session', toolUse.input, context.projectId);
        break;
      case 'daytona_delete_session':
        result = await DaytonaTools.executeDaytonaTool('daytona_delete_session', toolUse.input, context.projectId);
        break;
      case 'daytona_list_sessions':
        result = await DaytonaTools.executeDaytonaTool('daytona_list_sessions', toolUse.input, context.projectId);
        break;
      case 'daytona_code_run':
        result = await DaytonaTools.executeDaytonaTool('daytona_code_run', toolUse.input, context.projectId);
        break;
      case 'daytona_git_status':
        result = await DaytonaTools.executeDaytonaTool('daytona_git_status', toolUse.input, context.projectId);
        break;
      case 'daytona_git_add':
        result = await DaytonaTools.executeDaytonaTool('daytona_git_add', toolUse.input, context.projectId);
        break;
      case 'daytona_git_commit':
        result = await DaytonaTools.executeDaytonaTool('daytona_git_commit', toolUse.input, context.projectId);
        break;
      case 'daytona_git_push':
        result = await DaytonaTools.executeDaytonaTool('daytona_git_push', toolUse.input, context.projectId);
        break;
      case 'daytona_git_pull':
        result = await DaytonaTools.executeDaytonaTool('daytona_git_pull', toolUse.input, context.projectId);
        break;
      case 'daytona_git_branches':
        result = await DaytonaTools.executeDaytonaTool('daytona_git_branches', toolUse.input, context.projectId);
        break;
      case 'daytona_git_create_branch':
        result = await DaytonaTools.executeDaytonaTool('daytona_git_create_branch', toolUse.input, context.projectId);
        break;
      case 'daytona_git_checkout_branch':
        result = await DaytonaTools.executeDaytonaTool('daytona_git_checkout_branch', toolUse.input, context.projectId);
        break;
      case 'daytona_git_delete_branch':
        result = await DaytonaTools.executeDaytonaTool('daytona_git_delete_branch', toolUse.input, context.projectId);
        break;
      case 'daytona_create_folder':
        result = await DaytonaTools.executeDaytonaTool('daytona_create_folder', toolUse.input, context.projectId);
        break;
      case 'daytona_delete_file':
        result = await DaytonaTools.executeDaytonaTool('daytona_delete_file', toolUse.input, context.projectId);
        break;
      case 'daytona_move_file':
        result = await DaytonaTools.executeDaytonaTool('daytona_move_file', toolUse.input, context.projectId);
        break;
      case 'daytona_set_permissions':
        result = await DaytonaTools.executeDaytonaTool('daytona_set_permissions', toolUse.input, context.projectId);
        break;
      case 'daytona_get_file_info':
        result = await DaytonaTools.executeDaytonaTool('daytona_get_file_info', toolUse.input, context.projectId);
        break;
      case 'daytona_find_files':
        result = await DaytonaTools.executeDaytonaTool('daytona_find_files', toolUse.input, context.projectId);
        break;
      case 'daytona_replace_in_files':
        result = await DaytonaTools.executeDaytonaTool('daytona_replace_in_files', toolUse.input, context.projectId);
        break;
      case 'daytona_search_files':
        result = await DaytonaTools.executeDaytonaTool('daytona_search_files', toolUse.input, context.projectId);
        break;

      case 'submit_implementation_plan':
        // Just return the plan content so the frontend can render it
        // The actual "approval" logic happens in the frontend
        result = { plan: toolUse.input.plan };
        break;

      default:
        throw new Error(`Unknown tool: ${toolUse.name}`);
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    await logToolExecution(
      jobId,
      toolUse.name,
      'info',
      `Successfully executed ${toolUse.name} in ${duration}s`,
      { phase: 'complete', iteration, duration_seconds: parseFloat(duration), output: result, success: true, timestamp: new Date().toISOString() }
    );

    console.log(`[Tool ${jobId}] ✓ ${toolUse.name} completed in ${duration}s`);
    return { success: true, result };

  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Tool ${jobId}] ✗ ${toolUse.name} failed after ${duration}s`);
    console.error(`[Tool ${jobId}] Error:`, errorMsg);

    await logToolExecution(
      jobId,
      toolUse.name,
      'error',
      `${toolUse.name} failed: ${errorMsg}`,
      { phase: 'error', iteration, duration_seconds: parseFloat(duration), error_message: errorMsg, input: toolUse.input, success: false, timestamp: new Date().toISOString() }
    );

    return { success: false, error: errorMsg };
  }
}

/**
 * Execute agent tool for chat agent (without job ID)
 */
export async function executeAgentToolForChat(
  toolName: string,
  toolInput: any,
  context: { projectId: bigint; workspaceId: bigint; userId: string; }
): Promise<any> {
  const { projectId, userId } = context;

  // Get or create workspace
  let workspace = await daytonaManager.getProjectWorkspace(projectId);
  if (!workspace) {
    workspace = await daytonaManager.getOrCreateWorkspace(projectId);
  }
  const workspaceId = workspace.id;

  // Use a dummy Job ID for chat interactions (or create a real one if needed)
  const dummyJobId = BigInt(0);

  // Re-use executeAgentTool logic for consistency
  const result = await executeAgentTool({ name: toolName, input: toolInput }, {
    workspaceId,
    projectId,
    jobId: dummyJobId,
    userId
  });

  if (!result.success) {
    throw new Error(result.error);
  }
  return result.result;
}
