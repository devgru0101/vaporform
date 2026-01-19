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

      case 'daytona_set_preview_port':
        return await handleSetPreviewPort(workspace.id, toolInput);

      case 'daytona_get_workspace_metadata':
        return await handleGetWorkspaceMetadata(workspace.id);

      // PTY Session Management
      case 'daytona_create_session':
        return await handleCreateSession(workspace.id, toolInput);

      case 'daytona_session_exec':
        return await handleSessionExec(workspace.id, toolInput);

      case 'daytona_get_session':
        return await handleGetSession(workspace.id, toolInput);

      case 'daytona_delete_session':
        return await handleDeleteSession(workspace.id, toolInput);

      case 'daytona_list_sessions':
        return await handleListSessions(workspace.id);

      case 'daytona_code_run':
        return await handleCodeRun(workspace.id, toolInput);

      // Git Operations
      case 'daytona_git_status':
        return await handleGitStatus(workspace.id, toolInput);

      case 'daytona_git_add':
        return await handleGitAdd(workspace.id, toolInput);

      case 'daytona_git_commit':
        return await handleGitCommit(workspace.id, toolInput);

      case 'daytona_git_push':
        return await handleGitPush(workspace.id, toolInput);

      case 'daytona_git_pull':
        return await handleGitPull(workspace.id, toolInput);

      case 'daytona_git_branches':
        return await handleGitBranches(workspace.id, toolInput);

      case 'daytona_git_create_branch':
        return await handleGitCreateBranch(workspace.id, toolInput);

      case 'daytona_git_checkout_branch':
        return await handleGitCheckoutBranch(workspace.id, toolInput);

      case 'daytona_git_delete_branch':
        return await handleGitDeleteBranch(workspace.id, toolInput);

      // Filesystem Operations
      case 'daytona_create_folder':
        return await handleCreateFolder(workspace.id, toolInput);

      case 'daytona_delete_file':
        return await handleDeleteFile(workspace.id, toolInput);

      case 'daytona_move_file':
        return await handleMoveFile(workspace.id, toolInput);

      case 'daytona_set_permissions':
        return await handleSetPermissions(workspace.id, toolInput);

      case 'daytona_get_file_info':
        return await handleGetFileInfo(workspace.id, toolInput);

      case 'daytona_find_files':
        return await handleFindFiles(workspace.id, toolInput);

      case 'daytona_replace_in_files':
        return await handleReplaceInFiles(workspace.id, toolInput);

      case 'daytona_search_files':
        return await handleSearchFiles(workspace.id, toolInput);

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
  // Import validation utilities
  const { escapeShellArg, validateGitUrl } = await import('../shared/validation.js');

  // Validate git URL to prevent command injection
  try {
    validateGitUrl(input.url);
  } catch (error) {
    return {
      success: false,
      error: `Invalid Git URL: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }

  // Validate path to prevent path traversal
  if (input.path.includes('..') || input.path.includes('~') || input.path.startsWith('/')) {
    return {
      success: false,
      error: 'Invalid path: must be relative and cannot contain .. or ~',
    };
  }

  // Build command with proper escaping
  let command = `git clone ${escapeShellArg(input.url)} ${escapeShellArg(input.path)}`;
  if (input.branch) {
    // Validate branch name
    const { validateGitRef } = await import('../shared/validation.js');
    try {
      validateGitRef(input.branch);
      command += ` -b ${escapeShellArg(input.branch)}`;
    } catch (error) {
      return {
        success: false,
        error: `Invalid branch name: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
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

async function handleSetPreviewPort(
  workspaceId: bigint,
  input: { port: number }
): Promise<DaytonaToolResult> {
  if (!input.port || input.port < 3000 || input.port > 9999) {
    return {
      success: false,
      error: 'Port must be between 3000 and 9999',
    };
  }

  await daytonaManager.setPreviewPort(workspaceId, input.port);

  return {
    success: true,
    result: {
      message: `Preview port set to ${input.port}`,
      port: input.port,
      debug: {
        persisted_to_db: true,
        note: 'Port saved to workspace metadata - verify with daytona_get_workspace_metadata',
      },
    },
  };
}

async function handleGetWorkspaceMetadata(workspaceId: bigint): Promise<DaytonaToolResult> {
  const workspace = await daytonaManager.getWorkspace(workspaceId);

  return {
    success: true,
    result: {
      metadata: (workspace as any).metadata || {},
      workspace_id: workspace.id.toString(),
      status: workspace.status,
      daytona_sandbox_id: workspace.daytona_sandbox_id,
    },
  };
}

// ============================================================================
// PTY Session Management Handlers
// ============================================================================

async function handleCreateSession(
  workspaceId: bigint,
  input: { session_id: string }
): Promise<DaytonaToolResult> {
  try {
    console.log(`[Session Create] Creating session '${input.session_id}' for workspace ${workspaceId}`);
    await daytonaManager.createSession(workspaceId, input.session_id);
    console.log(`[Session Create] ✅ Successfully created session '${input.session_id}'`);
    return {
      success: true,
      result: {
        message: `PTY session '${input.session_id}' created successfully`,
        session_id: input.session_id,
      },
    };
  } catch (error) {
    console.error(`[Session Create] ❌ Failed to create session '${input.session_id}':`, error);
    console.error(`[Session Create] Error type:`, error?.constructor?.name);
    console.error(`[Session Create] Error details:`, JSON.stringify(error, Object.getOwnPropertyNames(error)));
    return {
      success: false,
      error: error instanceof Error ? error.message : JSON.stringify(error, Object.getOwnPropertyNames(error)),
    };
  }
}

async function handleSessionExec(
  workspaceId: bigint,
  input: { session_id: string; command: string }
): Promise<DaytonaToolResult> {
  try {
    const result = await daytonaManager.sessionExec(workspaceId, input.session_id, input.command);
    return {
      success: true,
      result: {
        message: `Command executed in session '${input.session_id}'`,
        session_id: input.session_id,
        command: input.command,
        output: result,
      },
    };
  } catch (error) {
    console.error('[Session Exec] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : JSON.stringify(error),
    };
  }
}

async function handleGetSession(
  workspaceId: bigint,
  input: { session_id: string }
): Promise<DaytonaToolResult> {
  try {
    const session = await daytonaManager.getSession(workspaceId, input.session_id);
    return {
      success: true,
      result: {
        session_id: input.session_id,
        session,
      },
    };
  } catch (error) {
    console.error(`[Session Get] ❌ Failed to get session '${input.session_id}':`, error);
    console.error(`[Session Get] Error type:`, error?.constructor?.name);
    console.error(`[Session Get] Details:`, JSON.stringify(error, Object.getOwnPropertyNames(error)));
    return {
      success: false,
      error: error instanceof Error ? error.message : JSON.stringify(error, Object.getOwnPropertyNames(error)),
    };
  }
}

async function handleDeleteSession(
  workspaceId: bigint,
  input: { session_id: string }
): Promise<DaytonaToolResult> {
  try {
    await daytonaManager.deleteSession(workspaceId, input.session_id);
    return {
      success: true,
      result: {
        message: `PTY session '${input.session_id}' deleted successfully`,
      },
    };
  } catch (error) {
    console.error(`[Session Delete] ❌ Failed to delete session '${input.session_id}':`, error);
    console.error(`[Session Delete] Error type:`, error?.constructor?.name);
    console.error(`[Session Delete] Details:`, JSON.stringify(error, Object.getOwnPropertyNames(error)));
    return {
      success: false,
      error: error instanceof Error ? error.message : JSON.stringify(error, Object.getOwnPropertyNames(error)),
    };
  }
}

async function handleListSessions(workspaceId: bigint): Promise<DaytonaToolResult> {
  try {
    const sessions = await daytonaManager.listSessions(workspaceId);
    return {
      success: true,
      result: {
        sessions,
        count: sessions.length,
      },
    };
  } catch (error) {
    console.error(`[Session List] ❌ Failed to list sessions:`, error);
    console.error(`[Session List] Error type:`, error?.constructor?.name);
    console.error(`[Session List] Details:`, JSON.stringify(error, Object.getOwnPropertyNames(error)));
    return {
      success: false,
      error: error instanceof Error ? error.message : JSON.stringify(error, Object.getOwnPropertyNames(error)),
    };
  }
}

async function handleCodeRun(
  workspaceId: bigint,
  input: { code: string; argv?: string[]; env?: Record<string, string> }
): Promise<DaytonaToolResult> {
  try {
    console.log(`[Code Run] 🚀 Executing code in workspace ${workspaceId}`);
    console.log(`[Code Run] Code length: ${input.code.length} characters`);
    if (input.argv) console.log(`[Code Run] Arguments:`, input.argv);
    if (input.env) console.log(`[Code Run] Environment:`, Object.keys(input.env));

    const result = await daytonaManager.codeRun(workspaceId, input.code, {
      argv: input.argv,
      env: input.env
    });

    console.log(`[Code Run] ✅ Execution completed with exit code: ${result.exitCode}`);

    return {
      success: true,
      result: {
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        artifacts: result.artifacts,
      },
    };
  } catch (error) {
    console.error(`[Code Run] ❌ Failed to execute code:`, error);
    console.error(`[Code Run] Error type:`, error?.constructor?.name);
    console.error(`[Code Run] Details:`, JSON.stringify(error, Object.getOwnPropertyNames(error)));
    return {
      success: false,
      error: error instanceof Error ? error.message : JSON.stringify(error, Object.getOwnPropertyNames(error)),
    };
  }
}

async function handleGitStatus(
  workspaceId: bigint,
  input: { repo_path: string }
): Promise<DaytonaToolResult> {
  try {
    console.log(`[Git Status] 📊 Getting status for ${input.repo_path}`);
    const status = await daytonaManager.gitStatus(workspaceId, input.repo_path);
    console.log(`[Git Status] ✅ Status retrieved`);
    return {
      success: true,
      result: { status },
    };
  } catch (error) {
    console.error(`[Git Status] ❌ Failed:`, error);
    console.error(`[Git Status] Error type:`, error?.constructor?.name);
    console.error(`[Git Status] Details:`, JSON.stringify(error, Object.getOwnPropertyNames(error)));
    return {
      success: false,
      error: error instanceof Error ? error.message : JSON.stringify(error, Object.getOwnPropertyNames(error)),
    };
  }
}

async function handleGitAdd(
  workspaceId: bigint,
  input: { repo_path: string; files: string[] }
): Promise<DaytonaToolResult> {
  try {
    console.log(`[Git Add] 📝 Staging files in ${input.repo_path}:`, input.files);
    await daytonaManager.gitAdd(workspaceId, input.repo_path, input.files);
    console.log(`[Git Add] ✅ Files staged successfully`);
    return {
      success: true,
      result: {
        message: `Staged ${input.files.length} file(s) in ${input.repo_path}`,
        files: input.files,
      },
    };
  } catch (error) {
    console.error(`[Git Add] ❌ Failed:`, error);
    console.error(`[Git Add] Error type:`, error?.constructor?.name);
    console.error(`[Git Add] Details:`, JSON.stringify(error, Object.getOwnPropertyNames(error)));
    return {
      success: false,
      error: error instanceof Error ? error.message : JSON.stringify(error, Object.getOwnPropertyNames(error)),
    };
  }
}

async function handleGitCommit(
  workspaceId: bigint,
  input: { repo_path: string; message: string; author: string; email: string }
): Promise<DaytonaToolResult> {
  try {
    console.log(`[Git Commit] 💾 Committing to ${input.repo_path}: "${input.message}"`);
    console.log(`[Git Commit] Author: ${input.author} <${input.email}>`);
    await daytonaManager.gitCommit(workspaceId, input.repo_path, input.message, input.author, input.email);
    console.log(`[Git Commit] ✅ Commit successful`);
    return {
      success: true,
      result: {
        message: `Successfully committed: "${input.message}"`,
        author: `${input.author} <${input.email}>`,
      },
    };
  } catch (error) {
    console.error(`[Git Commit] ❌ Failed:`, error);
    console.error(`[Git Commit] Error type:`, error?.constructor?.name);
    console.error(`[Git Commit] Details:`, JSON.stringify(error, Object.getOwnPropertyNames(error)));
    return {
      success: false,
      error: error instanceof Error ? error.message : JSON.stringify(error, Object.getOwnPropertyNames(error)),
    };
  }
}

async function handleGitPush(
  workspaceId: bigint,
  input: { repo_path: string }
): Promise<DaytonaToolResult> {
  try {
    console.log(`[Git Push] ⬆️  Pushing changes from ${input.repo_path}`);
    await daytonaManager.gitPush(workspaceId, input.repo_path);
    console.log(`[Git Push] ✅ Push successful`);
    return {
      success: true,
      result: {
        message: `Successfully pushed changes from ${input.repo_path}`,
      },
    };
  } catch (error) {
    console.error(`[Git Push] ❌ Failed:`, error);
    console.error(`[Git Push] Error type:`, error?.constructor?.name);
    console.error(`[Git Push] Details:`, JSON.stringify(error, Object.getOwnPropertyNames(error)));
    return {
      success: false,
      error: error instanceof Error ? error.message : JSON.stringify(error, Object.getOwnPropertyNames(error)),
    };
  }
}

async function handleGitPull(
  workspaceId: bigint,
  input: { repo_path: string }
): Promise<DaytonaToolResult> {
  try {
    console.log(`[Git Pull] ⬇️  Pulling changes to ${input.repo_path}`);
    await daytonaManager.gitPull(workspaceId, input.repo_path);
    console.log(`[Git Pull] ✅ Pull successful`);
    return {
      success: true,
      result: {
        message: `Successfully pulled changes to ${input.repo_path}`,
      },
    };
  } catch (error) {
    console.error(`[Git Pull] ❌ Failed:`, error);
    console.error(`[Git Pull] Error type:`, error?.constructor?.name);
    console.error(`[Git Pull] Details:`, JSON.stringify(error, Object.getOwnPropertyNames(error)));
    return {
      success: false,
      error: error instanceof Error ? error.message : JSON.stringify(error, Object.getOwnPropertyNames(error)),
    };
  }
}

async function handleGitBranches(
  workspaceId: bigint,
  input: { repo_path: string }
): Promise<DaytonaToolResult> {
  try {
    console.log(`[Git Branches] 🌿 Listing branches in ${input.repo_path}`);
    const branches = await daytonaManager.gitBranches(workspaceId, input.repo_path);
    console.log(`[Git Branches] ✅ Branches retrieved`);
    return {
      success: true,
      result: { branches },
    };
  } catch (error) {
    console.error(`[Git Branches] ❌ Failed:`, error);
    console.error(`[Git Branches] Error type:`, error?.constructor?.name);
    console.error(`[Git Branches] Details:`, JSON.stringify(error, Object.getOwnPropertyNames(error)));
    return {
      success: false,
      error: error instanceof Error ? error.message : JSON.stringify(error, Object.getOwnPropertyNames(error)),
    };
  }
}

async function handleGitCreateBranch(
  workspaceId: bigint,
  input: { repo_path: string; branch_name: string }
): Promise<DaytonaToolResult> {
  try {
    console.log(`[Git Create Branch] 🌱 Creating branch '${input.branch_name}' in ${input.repo_path}`);
    await daytonaManager.gitCreateBranch(workspaceId, input.repo_path, input.branch_name);
    console.log(`[Git Create Branch] ✅ Branch created successfully`);
    return {
      success: true,
      result: {
        message: `Successfully created branch '${input.branch_name}'`,
        branch: input.branch_name,
      },
    };
  } catch (error) {
    console.error(`[Git Create Branch] ❌ Failed:`, error);
    console.error(`[Git Create Branch] Error type:`, error?.constructor?.name);
    console.error(`[Git Create Branch] Details:`, JSON.stringify(error, Object.getOwnPropertyNames(error)));
    return {
      success: false,
      error: error instanceof Error ? error.message : JSON.stringify(error, Object.getOwnPropertyNames(error)),
    };
  }
}

async function handleGitCheckoutBranch(
  workspaceId: bigint,
  input: { repo_path: string; branch_name: string }
): Promise<DaytonaToolResult> {
  try {
    console.log(`[Git Checkout Branch] 🔀 Checking out branch '${input.branch_name}' in ${input.repo_path}`);
    await daytonaManager.gitCheckoutBranch(workspaceId, input.repo_path, input.branch_name);
    console.log(`[Git Checkout Branch] ✅ Branch checkout successful`);
    return {
      success: true,
      result: {
        message: `Successfully checked out branch '${input.branch_name}'`,
        branch: input.branch_name,
      },
    };
  } catch (error) {
    console.error(`[Git Checkout Branch] ❌ Failed:`, error);
    console.error(`[Git Checkout Branch] Error type:`, error?.constructor?.name);
    console.error(`[Git Checkout Branch] Details:`, JSON.stringify(error, Object.getOwnPropertyNames(error)));
    return {
      success: false,
      error: error instanceof Error ? error.message : JSON.stringify(error, Object.getOwnPropertyNames(error)),
    };
  }
}

async function handleGitDeleteBranch(
  workspaceId: bigint,
  input: { repo_path: string; branch_name: string }
): Promise<DaytonaToolResult> {
  try {
    console.log(`[Git Delete Branch] 🗑️  Deleting branch '${input.branch_name}' in ${input.repo_path}`);
    await daytonaManager.gitDeleteBranch(workspaceId, input.repo_path, input.branch_name);
    console.log(`[Git Delete Branch] ✅ Branch deleted successfully`);
    return {
      success: true,
      result: {
        message: `Successfully deleted branch '${input.branch_name}'`,
        branch: input.branch_name,
      },
    };
  } catch (error) {
    console.error(`[Git Delete Branch] ❌ Failed:`, error);
    console.error(`[Git Delete Branch] Error type:`, error?.constructor?.name);
    console.error(`[Git Delete Branch] Details:`, JSON.stringify(error, Object.getOwnPropertyNames(error)));
    return {
      success: false,
      error: error instanceof Error ? error.message : JSON.stringify(error, Object.getOwnPropertyNames(error)),
    };
  }
}

async function handleCreateFolder(
  workspaceId: bigint,
  input: { path: string; permissions?: string }
): Promise<DaytonaToolResult> {
  try {
    console.log(`[Create Folder] 📁 Creating directory: ${input.path}`);
    if (input.permissions) console.log(`[Create Folder] Permissions: ${input.permissions}`);

    await daytonaManager.createFolder(workspaceId, input.path, input.permissions);
    console.log(`[Create Folder] ✅ Folder created successfully`);

    return {
      success: true,
      result: {
        message: `Successfully created folder: ${input.path}`,
        path: input.path,
        permissions: input.permissions || '755',
      },
    };
  } catch (error) {
    console.error(`[Create Folder] ❌ Failed:`, error);
    console.error(`[Create Folder] Error type:`, error?.constructor?.name);
    console.error(`[Create Folder] Details:`, JSON.stringify(error, Object.getOwnPropertyNames(error)));
    return {
      success: false,
      error: error instanceof Error ? error.message : JSON.stringify(error, Object.getOwnPropertyNames(error)),
    };
  }
}

async function handleDeleteFile(
  workspaceId: bigint,
  input: { path: string }
): Promise<DaytonaToolResult> {
  try {
    console.log(`[Delete File] 🗑️  Deleting: ${input.path}`);

    await daytonaManager.deleteFile(workspaceId, input.path);
    console.log(`[Delete File] ✅ Deletion successful`);

    return {
      success: true,
      result: {
        message: `Successfully deleted: ${input.path}`,
        path: input.path,
      },
    };
  } catch (error) {
    console.error(`[Delete File] ❌ Failed:`, error);
    console.error(`[Delete File] Error type:`, error?.constructor?.name);
    console.error(`[Delete File] Details:`, JSON.stringify(error, Object.getOwnPropertyNames(error)));
    return {
      success: false,
      error: error instanceof Error ? error.message : JSON.stringify(error, Object.getOwnPropertyNames(error)),
    };
  }
}

async function handleMoveFile(
  workspaceId: bigint,
  input: { source_path: string; dest_path: string }
): Promise<DaytonaToolResult> {
  try {
    console.log(`[Move File] 📦 Moving: ${input.source_path} → ${input.dest_path}`);

    await daytonaManager.moveFile(workspaceId, input.source_path, input.dest_path);
    console.log(`[Move File] ✅ Move successful`);

    return {
      success: true,
      result: {
        message: `Successfully moved: ${input.source_path} → ${input.dest_path}`,
        source: input.source_path,
        destination: input.dest_path,
      },
    };
  } catch (error) {
    console.error(`[Move File] ❌ Failed:`, error);
    console.error(`[Move File] Error type:`, error?.constructor?.name);
    console.error(`[Move File] Details:`, JSON.stringify(error, Object.getOwnPropertyNames(error)));
    return {
      success: false,
      error: error instanceof Error ? error.message : JSON.stringify(error, Object.getOwnPropertyNames(error)),
    };
  }
}

async function handleSetPermissions(
  workspaceId: bigint,
  input: { path: string; mode: string }
): Promise<DaytonaToolResult> {
  try {
    console.log(`[Set Permissions] 🔐 chmod ${input.mode} ${input.path}`);

    await daytonaManager.setPermissions(workspaceId, input.path, input.mode);
    console.log(`[Set Permissions] ✅ Permissions set successfully`);

    return {
      success: true,
      result: {
        message: `Successfully set permissions ${input.mode} on: ${input.path}`,
        path: input.path,
        mode: input.mode,
      },
    };
  } catch (error) {
    console.error(`[Set Permissions] ❌ Failed:`, error);
    console.error(`[Set Permissions] Error type:`, error?.constructor?.name);
    console.error(`[Set Permissions] Details:`, JSON.stringify(error, Object.getOwnPropertyNames(error)));
    return {
      success: false,
      error: error instanceof Error ? error.message : JSON.stringify(error, Object.getOwnPropertyNames(error)),
    };
  }
}

async function handleGetFileInfo(
  workspaceId: bigint,
  input: { path: string }
): Promise<DaytonaToolResult> {
  try {
    console.log(`[Get File Info] ℹ️  Getting info for: ${input.path}`);

    const info = await daytonaManager.getFileInfo(workspaceId, input.path);
    console.log(`[Get File Info] ✅ Info retrieved`);

    return {
      success: true,
      result: { info },
    };
  } catch (error) {
    console.error(`[Get File Info] ❌ Failed:`, error);
    console.error(`[Get File Info] Error type:`, error?.constructor?.name);
    console.error(`[Get File Info] Details:`, JSON.stringify(error, Object.getOwnPropertyNames(error)));
    return {
      success: false,
      error: error instanceof Error ? error.message : JSON.stringify(error, Object.getOwnPropertyNames(error)),
    };
  }
}

async function handleFindFiles(
  workspaceId: bigint,
  input: { directory: string; pattern: string }
): Promise<DaytonaToolResult> {
  try {
    console.log(`[Find Files] 🔍 Searching in ${input.directory} for: ${input.pattern}`);

    const files = await daytonaManager.findFiles(workspaceId, input.directory, input.pattern);
    console.log(`[Find Files] ✅ Found ${files.length} file(s)`);

    return {
      success: true,
      result: {
        files,
        count: files.length,
        directory: input.directory,
        pattern: input.pattern,
      },
    };
  } catch (error) {
    console.error(`[Find Files] ❌ Failed:`, error);
    console.error(`[Find Files] Error type:`, error?.constructor?.name);
    console.error(`[Find Files] Details:`, JSON.stringify(error, Object.getOwnPropertyNames(error)));
    return {
      success: false,
      error: error instanceof Error ? error.message : JSON.stringify(error, Object.getOwnPropertyNames(error)),
    };
  }
}

async function handleReplaceInFiles(
  workspaceId: bigint,
  input: { directory: string; find: string; replace: string; file_pattern?: string }
): Promise<DaytonaToolResult> {
  try {
    console.log(`[Replace In Files] ✏️  Replacing "${input.find}" with "${input.replace}" in ${input.directory}`);
    if (input.file_pattern) console.log(`[Replace In Files] File pattern: ${input.file_pattern}`);

    const result = await daytonaManager.replaceInFiles(
      workspaceId,
      input.directory,
      input.find,
      input.replace,
      input.file_pattern
    );
    console.log(`[Replace In Files] ✅ Replacement completed`);

    return {
      success: true,
      result,
    };
  } catch (error) {
    console.error(`[Replace In Files] ❌ Failed:`, error);
    console.error(`[Replace In Files] Error type:`, error?.constructor?.name);
    console.error(`[Replace In Files] Details:`, JSON.stringify(error, Object.getOwnPropertyNames(error)));
    return {
      success: false,
      error: error instanceof Error ? error.message : JSON.stringify(error, Object.getOwnPropertyNames(error)),
    };
  }
}

async function handleSearchFiles(
  workspaceId: bigint,
  input: { directory: string; glob_pattern: string }
): Promise<DaytonaToolResult> {
  try {
    console.log(`[Search Files] 🔎 Searching ${input.directory} with pattern: ${input.glob_pattern}`);

    const files = await daytonaManager.searchFiles(workspaceId, input.directory, input.glob_pattern);
    console.log(`[Search Files] ✅ Found ${files.length} file(s)`);

    return {
      success: true,
      result: {
        files,
        count: files.length,
        directory: input.directory,
        pattern: input.glob_pattern,
      },
    };
  } catch (error) {
    console.error(`[Search Files] ❌ Failed:`, error);
    console.error(`[Search Files] Error type:`, error?.constructor?.name);
    console.error(`[Search Files] Details:`, JSON.stringify(error, Object.getOwnPropertyNames(error)));
    return {
      success: false,
      error: error instanceof Error ? error.message : JSON.stringify(error, Object.getOwnPropertyNames(error)),
    };
  }
}
