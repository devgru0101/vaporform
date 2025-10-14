/**
 * Daytona MCP Tool Handlers
 * Implements tool execution for Daytona sandbox operations
 */

import { daytonaManager } from '../workspace/daytona-manager.js';
import { db as projectsDb } from '../projects/db.js';

interface DaytonaToolResult {
  success: boolean;
  result?: any;
  error?: string;
}

/**
 * Execute a Daytona tool call
 */
export async function executeDaytonaTool(
  toolName: string,
  toolInput: any,
  projectId: bigint
): Promise<DaytonaToolResult> {
  try {
    // Get the workspace for this project
    const workspace = await daytonaManager.getProjectWorkspace(projectId);

    if (!workspace) {
      return {
        success: false,
        error: 'No Daytona workspace found for this project. Please create a workspace first.',
      };
    }

    if (workspace.status !== 'running' && !['daytona_get_workspace_status', 'daytona_get_preview_url'].includes(toolName)) {
      return {
        success: false,
        error: `Workspace is ${workspace.status}. It must be running to execute this command.`,
      };
    }

    switch (toolName) {
      case 'daytona_execute_command':
        return await handleExecuteCommand(workspace.id, toolInput);

      case 'daytona_read_file':
        return await handleReadFile(workspace.id, toolInput);

      case 'daytona_write_file':
        return await handleWriteFile(workspace.id, toolInput);

      case 'daytona_list_files':
        return await handleListFiles(workspace.id, toolInput);

      case 'daytona_get_preview_url':
        return await handleGetPreviewUrl(workspace.id);

      case 'daytona_git_clone':
        return await handleGitClone(workspace.id, toolInput);

      case 'daytona_get_workspace_status':
        return await handleGetWorkspaceStatus(workspace.id);

      default:
        return {
          success: false,
          error: `Unknown Daytona tool: ${toolName}`,
        };
    }
  } catch (error) {
    console.error(`Error executing Daytona tool ${toolName}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function handleExecuteCommand(
  workspaceId: bigint,
  input: { command: string }
): Promise<DaytonaToolResult> {
  const result = await daytonaManager.executeCommand(workspaceId, input.command);
  return {
    success: result.exitCode === 0,
    result: {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    },
  };
}

async function handleReadFile(
  workspaceId: bigint,
  input: { path: string }
): Promise<DaytonaToolResult> {
  const content = await daytonaManager.readFile(workspaceId, input.path);
  return {
    success: true,
    result: { content },
  };
}

async function handleWriteFile(
  workspaceId: bigint,
  input: { path: string; content: string }
): Promise<DaytonaToolResult> {
  await daytonaManager.writeFile(workspaceId, input.path, input.content);
  return {
    success: true,
    result: { message: `File written successfully: ${input.path}` },
  };
}

async function handleListFiles(
  workspaceId: bigint,
  input: { path?: string }
): Promise<DaytonaToolResult> {
  const path = input.path || '.';
  const result = await daytonaManager.executeCommand(workspaceId, `ls -la ${path}`);

  return {
    success: result.exitCode === 0,
    result: {
      files: result.stdout,
      path,
    },
  };
}

async function handleGetPreviewUrl(workspaceId: bigint): Promise<DaytonaToolResult> {
  const url = await daytonaManager.getSandboxUrl(workspaceId);

  if (!url) {
    return {
      success: false,
      error: 'No preview URL available. The workspace may not be running or configured.',
    };
  }

  return {
    success: true,
    result: { url },
  };
}

async function handleGitClone(
  workspaceId: bigint,
  input: { url: string; path: string; branch?: string }
): Promise<DaytonaToolResult> {
  let command = `git clone ${input.url} ${input.path}`;
  if (input.branch) {
    command += ` -b ${input.branch}`;
  }

  const result = await daytonaManager.executeCommand(workspaceId, command);

  return {
    success: result.exitCode === 0,
    result: {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    },
  };
}

async function handleGetWorkspaceStatus(workspaceId: bigint): Promise<DaytonaToolResult> {
  const workspace = await daytonaManager.getWorkspace(workspaceId);

  return {
    success: true,
    result: {
      status: workspace.status,
      sandbox_id: workspace.daytona_sandbox_id,
      started_at: workspace.started_at,
      error_message: workspace.error_message,
    },
  };
}
