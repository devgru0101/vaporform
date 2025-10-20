// Vaporform Agent Tool Execution System
// Inspired by KiloCode's tool architecture

import {
  ToolUse,
  ToolResult,
  ToolExecutionContext,
  ReadFileParams,
  WriteFileParams,
  ExecuteCommandParams,
  ListFilesParams,
  SearchFilesParams,
} from './types';

// Tool definitions for the AI model
export const AGENT_TOOLS = [
  {
    name: 'read_file',
    description: 'Read the contents of a file from the project workspace. Can read single files or multiple files at once for efficiency.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The relative path to the file within the project workspace',
        },
        line_range: {
          type: 'object',
          description: 'Optional: Read only specific lines',
          properties: {
            start: { type: 'number' },
            end: { type: 'number' },
          },
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_to_file',
    description: 'Create a new file or overwrite an existing file with new content. Always provide the complete file content.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The relative path where the file should be created/updated',
        },
        content: {
          type: 'string',
          description: 'The complete content to write to the file',
        },
        line_count: {
          type: 'number',
          description: 'The number of lines in the content (for validation)',
        },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'execute_command',
    description: 'Execute a shell command in the project workspace terminal. Use this for running builds, tests, installing packages, etc.',
    input_schema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The shell command to execute',
        },
        cwd: {
          type: 'string',
          description: 'Optional: Working directory (relative to project root)',
        },
      },
      required: ['command'],
    },
  },
  {
    name: 'list_files',
    description: 'List files and directories in the project workspace',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Optional: Directory path to list (defaults to root)',
        },
        recursive: {
          type: 'boolean',
          description: 'Whether to list files recursively',
        },
      },
    },
  },
  {
    name: 'search_files',
    description: 'Search for files matching a pattern in the project workspace',
    input_schema: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'Search pattern (supports glob patterns)',
        },
        path: {
          type: 'string',
          description: 'Optional: Directory to search in',
        },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'ask_followup_question',
    description: 'Ask the user a follow-up question to gather more information',
    input_schema: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description: 'The question to ask the user',
        },
      },
      required: ['question'],
    },
  },
  {
    name: 'attempt_completion',
    description: 'Present the result of the task to the user. Use this when you have completed the task.',
    input_schema: {
      type: 'object',
      properties: {
        result: {
          type: 'string',
          description: 'Summary of what was accomplished',
        },
        command: {
          type: 'string',
          description: 'Optional: A command for the user to run to verify the result',
        },
      },
    },
  },
  // Daytona workspace management tools
  {
    name: 'daytona_execute_command',
    description: 'Execute a shell command in the Daytona sandbox. Use this for running builds, tests, installing packages, starting servers, or any terminal commands. Returns stdout, stderr, and exit code.',
    input_schema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The shell command to execute in the sandbox',
        },
      },
      required: ['command'],
    },
  },
  {
    name: 'daytona_get_workspace_status',
    description: 'Get the status of the Daytona workspace (running, stopped, error, etc.). Use this to check if the workspace is ready before executing commands.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'ensure_workspace_running',
    description: 'Ensure the Daytona workspace is running before performing operations. Automatically starts stopped workspaces and recovers errored ones. Returns workspace status.',
    input_schema: {
      type: 'object',
      properties: {
        wait_for_ready: {
          type: 'boolean',
          description: 'Wait up to 60 seconds for workspace to be ready',
        },
      },
    },
  },
  {
    name: 'restart_workspace',
    description: 'Restart the Daytona workspace. Use this when the workspace is in an error state or needs a fresh start.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'daytona_read_file',
    description: 'Read a file from the Daytona sandbox filesystem. Use this instead of read_file when you need to access files in the running sandbox environment.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The absolute path to the file in the sandbox',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'daytona_write_file',
    description: 'Write a file to the Daytona sandbox filesystem. Use this instead of write_to_file when you need to create files in the running sandbox environment.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The absolute path where the file should be created in the sandbox',
        },
        content: {
          type: 'string',
          description: 'The content to write to the file',
        },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'daytona_list_files',
    description: 'List files and directories in the Daytona sandbox filesystem. Use this to explore the sandbox directory structure.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The directory path to list in the sandbox',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'daytona_get_preview_url',
    description: 'Get the preview URL for the running application in the Daytona sandbox. Use this to show the user where they can view their application.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  // PTY Session Management for Interactive Commands
  {
    name: 'start_interactive_session',
    description: 'Start an interactive PTY session for running long-running commands like dev servers. This is better than execute_command for processes that don\'t exit (npm run dev, python manage.py runserver, etc.). Returns a session ID for managing the process.',
    input_schema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The command to run in an interactive session (e.g., "npm run dev", "npm start")',
        },
      },
      required: ['command'],
    },
  },
  {
    name: 'send_pty_input',
    description: 'Send input/commands to an active PTY session. Use this to interact with running processes (send Ctrl+C, type commands, etc.).',
    input_schema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'The PTY session ID returned from start_interactive_session',
        },
        input: {
          type: 'string',
          description: 'The input to send (commands, keystrokes, control sequences like \\n for enter)',
        },
      },
      required: ['sessionId', 'input'],
    },
  },
  {
    name: 'get_pty_status',
    description: 'Check the status of a PTY session (connected, disconnected, exit code). Use this to monitor long-running processes.',
    input_schema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'The PTY session ID to check',
        },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'kill_pty_session',
    description: 'Stop/kill a running PTY session. Use this to terminate long-running processes like dev servers.',
    input_schema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'The PTY session ID to kill',
        },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'list_pty_sessions',
    description: 'List all active PTY sessions for the current workspace. Shows which long-running processes are active.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'start_dev_server',
    description: 'Start the development server for the project using PTY. This automatically detects the project type and runs the appropriate command (npm run dev, npm start, etc.). Returns session ID and success status.',
    input_schema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'Optional: Override the default dev server command (e.g., "npm run dev", "yarn dev", "python manage.py runserver"). If not provided, will detect automatically.',
        },
      },
    },
  },
];

// Tool executor factory
export class AgentToolExecutor {
  private apiUrl: string;
  private tokenGetter: (() => Promise<string | null>) | null = null;

  constructor(apiUrl: string) {
    this.apiUrl = apiUrl;
  }

  setTokenGetter(getter: () => Promise<string | null>) {
    this.tokenGetter = getter;
  }

  private async request(endpoint: string, body: any, method: 'GET' | 'POST' | 'DELETE' = 'POST'): Promise<any> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Get fresh token for each request
    if (this.tokenGetter) {
      const token = await this.tokenGetter();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }

    const options: RequestInit = {
      method,
      headers,
    };

    let url = `${this.apiUrl}${endpoint}`;

    // For GET requests, add query parameters; for POST/DELETE requests, add body
    if (method === 'GET' && body) {
      const params = new URLSearchParams();
      Object.entries(body).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          params.append(key, String(value));
        }
      });
      const queryString = params.toString();
      if (queryString) {
        url += `?${queryString}`;
      }
    } else if (method === 'POST' || method === 'DELETE') {
      options.body = JSON.stringify(body);
    }

    const hasToken = !!headers['Authorization'];
    console.log('[AgentToolExecutor] Making request', {
      method,
      url,
      hasAuthToken: hasToken,
      bodyKeys: Object.keys(body || {}),
    });

    const response = await fetch(url, options);

    console.log('[AgentToolExecutor] Response received', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      console.error('[AgentToolExecutor] Request failed', {
        status: response.status,
        error,
      });
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    return response.json();
  }

  async executeReadFile(params: ReadFileParams, context: ToolExecutionContext): Promise<ToolResult> {
    try {
      const response = await this.request(`/vfs/files/${context.projectId}/${params.path}`, {}, 'GET');

      // Content is returned as base64, decode it
      const content = Buffer.from(response.content, 'base64').toString('utf-8');

      let finalContent = content;
      if (params.line_range) {
        const lines = content.split('\n');
        finalContent = lines
          .slice(params.line_range.start - 1, params.line_range.end)
          .map((line: string, i: number) => `${params.line_range!.start + i}\t${line}`)
          .join('\n');
      } else {
        // Add line numbers to full file content
        const lines = content.split('\n');
        finalContent = lines.map((line: string, i: number) => `${i + 1}\t${line}`).join('\n');
      }

      return {
        tool_use_id: '',
        content: `<file>\n<path>${params.path}</path>\n<content>\n${finalContent}\n</content>\n</file>`,
      };
    } catch (error: any) {
      return {
        tool_use_id: '',
        content: `<file>\n<path>${params.path}</path>\n<error>${error.message}</error>\n</file>`,
        error: error.message,
      };
    }
  }

  async executeWriteFile(params: WriteFileParams, context: ToolExecutionContext): Promise<ToolResult> {
    try {
      console.log('[AgentToolExecutor] executeWriteFile called', {
        path: params.path,
        projectId: context.projectId,
        contentLength: params.content?.length,
        hasTokenGetter: !!this.tokenGetter,
      });

      const response = await this.request('/vfs/files', {
        projectId: context.projectId,
        path: params.path,
        content: params.content,
      });

      console.log('[AgentToolExecutor] writeFile success', response);

      return {
        tool_use_id: '',
        content: `Successfully wrote ${params.content.split('\n').length} lines to ${params.path}`,
      };
    } catch (error: any) {
      console.error('[AgentToolExecutor] writeFile error', {
        message: error.message,
        error,
        stack: error.stack,
      });

      return {
        tool_use_id: '',
        content: `Error writing file: ${error.message}`,
        error: error.message,
      };
    }
  }

  async executeCommand(params: ExecuteCommandParams, context: ToolExecutionContext): Promise<ToolResult> {
    try {
      if (!context.workspaceId) {
        throw new Error('No workspace ID available for command execution');
      }

      const response = await this.request(`/workspace/${context.workspaceId}/exec`, {
        command: params.command,
      });

      const output = [response.stdout, response.stderr].filter(Boolean).join('\n');

      return {
        tool_use_id: '',
        content: `Command executed in workspace.\nExit code: ${response.exitCode}\nOutput:\n${output}`,
      };
    } catch (error: any) {
      return {
        tool_use_id: '',
        content: `Error executing command: ${error.message}`,
        error: error.message,
      };
    }
  }

  async executeListFiles(params: ListFilesParams, context: ToolExecutionContext): Promise<ToolResult> {
    try {
      const response = await this.request(`/vfs/directories/${context.projectId}`, {
        path: params.path || '/',
      }, 'GET');

      const fileList = response.files
        .map((file: any) => `${file.type === 'dir' ? '[DIR]' : '[FILE]'} ${file.path}`)
        .join('\n');

      return {
        tool_use_id: '',
        content: `Files in ${params.path || '/'}:\n${fileList}`,
      };
    } catch (error: any) {
      return {
        tool_use_id: '',
        content: `Error listing files: ${error.message}`,
        error: error.message,
      };
    }
  }

  async executeSearchFiles(params: SearchFilesParams, context: ToolExecutionContext): Promise<ToolResult> {
    try {
      const response = await this.request('/vfs/search', {
        projectId: context.projectId,
        pattern: params.pattern,
        path: params.path || '/',
      });

      const results = response.matches
        .map((match: any) => `${match.path}:${match.line}:${match.content}`)
        .join('\n');

      return {
        tool_use_id: '',
        content: `Search results for "${params.pattern}":\n${results || 'No matches found'}`,
      };
    } catch (error: any) {
      return {
        tool_use_id: '',
        content: `Error searching files: ${error.message}`,
        error: error.message,
      };
    }
  }

  // Daytona workspace tool executors
  async executeDaytonaCommand(params: ExecuteCommandParams, context: ToolExecutionContext): Promise<ToolResult> {
    try {
      if (!context.workspaceId) {
        throw new Error('No workspace ID available for Daytona command execution');
      }

      console.log('[AgentToolExecutor] executeDaytonaCommand', {
        command: params.command,
        workspaceId: context.workspaceId,
      });

      const response = await this.request(`/workspace/${context.workspaceId}/exec`, {
        command: params.command,
      });

      console.log('[AgentToolExecutor] Daytona command response', {
        exitCode: response.exitCode,
        hasStdout: !!response.stdout,
        hasStderr: !!response.stderr,
        stdoutLength: response.stdout?.length || 0,
        stderrLength: response.stderr?.length || 0,
      });

      const stdout = response.stdout || '';
      const stderr = response.stderr || '';
      const output = [stdout, stderr].filter(Boolean).join('\n');

      // Validate we got some output
      if (!output && response.exitCode === 0) {
        console.warn('[AgentToolExecutor] Command succeeded but returned no output');
      }

      return {
        tool_use_id: '',
        content: `Command executed in Daytona sandbox.\nExit code: ${response.exitCode}\n${stdout ? `Stdout:\n${stdout}` : ''}${stderr ? `\nStderr:\n${stderr}` : ''}${!output ? '\n(No output)' : ''}`,
      };
    } catch (error: any) {
      console.error('[AgentToolExecutor] Daytona command error', {
        message: error.message,
        error,
      });

      return {
        tool_use_id: '',
        content: `Error executing Daytona command: ${error.message}`,
        error: error.message,
      };
    }
  }

  async executeDaytonaGetWorkspaceStatus(context: ToolExecutionContext): Promise<ToolResult> {
    try {
      if (!context.workspaceId) {
        throw new Error('No workspace ID available');
      }

      console.log('[AgentToolExecutor] executeDaytonaGetWorkspaceStatus', {
        workspaceId: context.workspaceId,
      });

      const response = await this.request(`/workspace/${context.workspaceId}`, {}, 'GET');

      console.log('[AgentToolExecutor] Workspace status response', response);

      const workspace = response.workspace;
      return {
        tool_use_id: '',
        content: `Workspace status: ${workspace.status}\nSandbox ID: ${workspace.daytona_sandbox_id || 'None'}\nProject ID: ${workspace.project_id}`,
      };
    } catch (error: any) {
      console.error('[AgentToolExecutor] Get workspace status error', error);

      return {
        tool_use_id: '',
        content: `Error getting workspace status: ${error.message}`,
        error: error.message,
      };
    }
  }

  async executeEnsureWorkspaceRunning(params: any, context: ToolExecutionContext): Promise<ToolResult> {
    try {
      if (!context.projectId) {
        throw new Error('No project ID available');
      }

      console.log('[AgentToolExecutor] executeEnsureWorkspaceRunning', {
        projectId: context.projectId,
        waitForReady: params.wait_for_ready,
      });

      // Use getProjectWorkspace which has smart workspace management
      // This will auto-create if missing, auto-start if stopped, and recover if errored
      const waitForReady = params.wait_for_ready !== false; // Default to true
      const url = `/workspace/project/${context.projectId}${waitForReady ? '?waitForReady=true' : ''}`;

      const response = await this.request(url, {}, 'GET');

      console.log('[AgentToolExecutor] Ensure running response', response);

      const workspace = response.workspace;
      if (!workspace) {
        return {
          tool_use_id: '',
          content: `Failed to create or start workspace for project ${context.projectId}`,
          error: 'No workspace available',
        };
      }

      return {
        tool_use_id: '',
        content: `Workspace is ${workspace.status}.\nStatus: ${workspace.status}\nSandbox ID: ${workspace.daytona_sandbox_id || 'None'}\nWorkspace ID: ${workspace.id}`,
      };
    } catch (error: any) {
      console.error('[AgentToolExecutor] Ensure workspace running error', error);

      return {
        tool_use_id: '',
        content: `Error ensuring workspace is running: ${error.message}`,
        error: error.message,
      };
    }
  }

  async executeRestartWorkspace(context: ToolExecutionContext): Promise<ToolResult> {
    try {
      if (!context.workspaceId) {
        throw new Error('No workspace ID available');
      }

      console.log('[AgentToolExecutor] executeRestartWorkspace', {
        workspaceId: context.workspaceId,
      });

      const response = await this.request(`/workspace/${context.workspaceId}/restart`, {});

      console.log('[AgentToolExecutor] Restart workspace response', response);

      const workspace = response.workspace;
      return {
        tool_use_id: '',
        content: `Workspace restarted successfully.\nStatus: ${workspace.status}\nSandbox ID: ${workspace.daytona_sandbox_id || 'None'}`,
      };
    } catch (error: any) {
      console.error('[AgentToolExecutor] Restart workspace error', error);

      return {
        tool_use_id: '',
        content: `Error restarting workspace: ${error.message}`,
        error: error.message,
      };
    }
  }

  async executeDaytonaReadFile(params: ReadFileParams, context: ToolExecutionContext): Promise<ToolResult> {
    try {
      if (!context.workspaceId) {
        throw new Error('No workspace ID available');
      }

      console.log('[AgentToolExecutor] executeDaytonaReadFile', {
        path: params.path,
        workspaceId: context.workspaceId,
      });

      // Use execute command to read file from sandbox
      const command = `cat ${params.path}`;
      const response = await this.request(`/workspace/${context.workspaceId}/exec`, {
        command,
      });

      if (response.exitCode !== 0) {
        throw new Error(response.stderr || 'Failed to read file');
      }

      return {
        tool_use_id: '',
        content: `<file>\n<path>${params.path}</path>\n<content>\n${response.stdout}\n</content>\n</file>`,
      };
    } catch (error: any) {
      console.error('[AgentToolExecutor] Daytona read file error', error);

      return {
        tool_use_id: '',
        content: `<file>\n<path>${params.path}</path>\n<error>${error.message}</error>\n</file>`,
        error: error.message,
      };
    }
  }

  async executeDaytonaWriteFile(params: WriteFileParams, context: ToolExecutionContext): Promise<ToolResult> {
    try {
      if (!context.workspaceId) {
        throw new Error('No workspace ID available');
      }

      console.log('[AgentToolExecutor] executeDaytonaWriteFile', {
        path: params.path,
        workspaceId: context.workspaceId,
        contentLength: params.content?.length,
      });

      // Escape content for shell command
      const escapedContent = params.content.replace(/'/g, "'\\''");
      const command = `echo '${escapedContent}' > ${params.path}`;

      const response = await this.request(`/workspace/${context.workspaceId}/exec`, {
        command,
      });

      if (response.exitCode !== 0) {
        throw new Error(response.stderr || 'Failed to write file');
      }

      return {
        tool_use_id: '',
        content: `Successfully wrote file to ${params.path} in Daytona sandbox`,
      };
    } catch (error: any) {
      console.error('[AgentToolExecutor] Daytona write file error', error);

      return {
        tool_use_id: '',
        content: `Error writing file to Daytona sandbox: ${error.message}`,
        error: error.message,
      };
    }
  }

  async executeDaytonaListFiles(params: ListFilesParams, context: ToolExecutionContext): Promise<ToolResult> {
    try {
      if (!context.workspaceId) {
        throw new Error('No workspace ID available');
      }

      console.log('[AgentToolExecutor] executeDaytonaListFiles', {
        path: params.path,
        workspaceId: context.workspaceId,
      });

      const command = `ls -la ${params.path || '.'}`;
      const response = await this.request(`/workspace/${context.workspaceId}/exec`, {
        command,
      });

      if (response.exitCode !== 0) {
        throw new Error(response.stderr || 'Failed to list files');
      }

      return {
        tool_use_id: '',
        content: `Files in ${params.path || '.'}:\n${response.stdout}`,
      };
    } catch (error: any) {
      console.error('[AgentToolExecutor] Daytona list files error', error);

      return {
        tool_use_id: '',
        content: `Error listing files in Daytona sandbox: ${error.message}`,
        error: error.message,
      };
    }
  }

  async executeDaytonaGetPreviewUrl(context: ToolExecutionContext): Promise<ToolResult> {
    try {
      if (!context.workspaceId) {
        throw new Error('No workspace ID available');
      }

      console.log('[AgentToolExecutor] executeDaytonaGetPreviewUrl', {
        workspaceId: context.workspaceId,
      });

      const response = await this.request(`/workspace/${context.workspaceId}/url`, {}, 'GET');

      console.log('[AgentToolExecutor] Preview URL response', response);

      if (!response.url) {
        return {
          tool_use_id: '',
          content: `Preview URL not available. The workspace may not be running or may not have a web server started.`,
        };
      }

      return {
        tool_use_id: '',
        content: `Preview URL: ${response.url}\nPort: ${response.port || 'default'}`,
      };
    } catch (error: any) {
      console.error('[AgentToolExecutor] Get preview URL error', error);

      return {
        tool_use_id: '',
        content: `Error getting preview URL: ${error.message}`,
        error: error.message,
      };
    }
  }

  // PTY Management Tools

  async executeStartInteractiveSession(params: { command: string }, context: ToolExecutionContext): Promise<ToolResult> {
    try {
      if (!context.workspaceId) {
        throw new Error('No workspace ID available');
      }

      console.log('[AgentToolExecutor] executeStartInteractiveSession', {
        workspaceId: context.workspaceId,
        command: params.command,
      });

      const response = await this.request(`/workspace/${context.workspaceId}/pty`, {
        command: params.command,
        cols: 120,
        rows: 30,
      });

      console.log('[AgentToolExecutor] PTY session created', response);

      return {
        tool_use_id: '',
        content: `Interactive PTY session started successfully.\nSession ID: ${response.sessionId}\nCommand: ${params.command}\n\nUse send_pty_input to interact with the session, get_pty_status to check status, or kill_pty_session to stop it.`,
      };
    } catch (error: any) {
      console.error('[AgentToolExecutor] Start PTY session error', error);

      return {
        tool_use_id: '',
        content: `Error starting PTY session: ${error.message}`,
        error: error.message,
      };
    }
  }

  async executeSendPtyInput(params: { sessionId: string; input: string }, context: ToolExecutionContext): Promise<ToolResult> {
    try {
      if (!context.workspaceId) {
        throw new Error('No workspace ID available');
      }

      console.log('[AgentToolExecutor] executeSendPtyInput', {
        workspaceId: context.workspaceId,
        sessionId: params.sessionId,
        inputLength: params.input.length,
      });

      const response = await this.request(`/workspace/${context.workspaceId}/pty/${params.sessionId}/input`, {
        input: params.input,
      });

      return {
        tool_use_id: '',
        content: `Input sent to PTY session ${params.sessionId} successfully.`,
      };
    } catch (error: any) {
      console.error('[AgentToolExecutor] Send PTY input error', error);

      return {
        tool_use_id: '',
        content: `Error sending input to PTY session: ${error.message}`,
        error: error.message,
      };
    }
  }

  async executeGetPtyStatus(params: { sessionId: string }, context: ToolExecutionContext): Promise<ToolResult> {
    try {
      if (!context.workspaceId) {
        throw new Error('No workspace ID available');
      }

      console.log('[AgentToolExecutor] executeGetPtyStatus', {
        workspaceId: context.workspaceId,
        sessionId: params.sessionId,
      });

      const response = await this.request(`/workspace/${context.workspaceId}/pty/${params.sessionId}/status`, {}, 'GET');

      console.log('[AgentToolExecutor] PTY status', response);

      return {
        tool_use_id: '',
        content: `PTY Session Status:\nSession ID: ${params.sessionId}\nRunning: ${response.running}\nExit Code: ${response.exitCode || 'N/A'}\n${response.output ? `\nRecent Output:\n${response.output}` : ''}`,
      };
    } catch (error: any) {
      console.error('[AgentToolExecutor] Get PTY status error', error);

      return {
        tool_use_id: '',
        content: `Error getting PTY status: ${error.message}`,
        error: error.message,
      };
    }
  }

  async executeKillPtySession(params: { sessionId: string }, context: ToolExecutionContext): Promise<ToolResult> {
    try {
      if (!context.workspaceId) {
        throw new Error('No workspace ID available');
      }

      console.log('[AgentToolExecutor] executeKillPtySession', {
        workspaceId: context.workspaceId,
        sessionId: params.sessionId,
      });

      await this.request(`/workspace/${context.workspaceId}/pty/${params.sessionId}`, {}, 'DELETE');

      return {
        tool_use_id: '',
        content: `PTY session ${params.sessionId} killed successfully.`,
      };
    } catch (error: any) {
      console.error('[AgentToolExecutor] Kill PTY session error', error);

      return {
        tool_use_id: '',
        content: `Error killing PTY session: ${error.message}`,
        error: error.message,
      };
    }
  }

  async executeListPtySessions(context: ToolExecutionContext): Promise<ToolResult> {
    try {
      if (!context.workspaceId) {
        throw new Error('No workspace ID available');
      }

      console.log('[AgentToolExecutor] executeListPtySessions', {
        workspaceId: context.workspaceId,
      });

      const response = await this.request(`/workspace/${context.workspaceId}/pty`, {}, 'GET');

      console.log('[AgentToolExecutor] PTY sessions list', response);

      if (!response.sessions || response.sessions.length === 0) {
        return {
          tool_use_id: '',
          content: 'No active PTY sessions.',
        };
      }

      const sessionList = response.sessions
        .map((s: any) => `- ${s.sessionId}: ${s.running ? 'RUNNING' : 'STOPPED'} (exit code: ${s.exitCode || 'N/A'})`)
        .join('\n');

      return {
        tool_use_id: '',
        content: `Active PTY Sessions:\n${sessionList}`,
      };
    } catch (error: any) {
      console.error('[AgentToolExecutor] List PTY sessions error', error);

      return {
        tool_use_id: '',
        content: `Error listing PTY sessions: ${error.message}`,
        error: error.message,
      };
    }
  }

  async executeStartDevServer(params: { command?: string }, context: ToolExecutionContext): Promise<ToolResult> {
    try {
      if (!context.workspaceId) {
        throw new Error('No workspace ID available');
      }

      console.log('[AgentToolExecutor] executeStartDevServer', {
        workspaceId: context.workspaceId,
        command: params.command,
      });

      const response = await this.request(`/workspace/${context.workspaceId}/dev-server`, {
        command: params.command || 'npm run dev',
      });

      console.log('[AgentToolExecutor] Dev server started', response);

      return {
        tool_use_id: '',
        content: `${response.message}\nSession ID: ${response.sessionId}\n\nThe dev server is now running in the background. Use get_pty_status to check its output, or daytona_get_preview_url to get the preview URL.`,
      };
    } catch (error: any) {
      console.error('[AgentToolExecutor] Start dev server error', error);

      return {
        tool_use_id: '',
        content: `Error starting dev server: ${error.message}`,
        error: error.message,
      };
    }
  }

  async executeTool(tool: ToolUse, context: ToolExecutionContext): Promise<ToolResult> {
    console.log('[AgentToolExecutor] executeTool called', {
      toolName: tool.tool,
      toolId: tool.id,
      hasParams: !!tool.params,
      contextProjectId: context.projectId,
      contextWorkspaceId: context.workspaceId,
    });

    let result: ToolResult;

    switch (tool.tool) {
      case 'read_file':
        result = await this.executeReadFile(tool.params as ReadFileParams, context);
        break;
      case 'write_to_file':
        result = await this.executeWriteFile(tool.params as WriteFileParams, context);
        break;
      case 'execute_command':
        result = await this.executeCommand(tool.params as ExecuteCommandParams, context);
        break;
      case 'list_files':
        result = await this.executeListFiles(tool.params as ListFilesParams, context);
        break;
      case 'search_files':
        result = await this.executeSearchFiles(tool.params as SearchFilesParams, context);
        break;
      case 'ask_followup_question':
        // Handle in UI - this returns immediately
        result = {
          tool_use_id: tool.id,
          content: tool.params.question || '',
        };
        break;
      case 'attempt_completion':
        // Handle in UI - this signals task completion
        result = {
          tool_use_id: tool.id,
          content: tool.params.result || 'Task completed',
        };
        break;
      // Daytona workspace management tools
      case 'daytona_execute_command':
        result = await this.executeDaytonaCommand(tool.params as ExecuteCommandParams, context);
        break;
      case 'daytona_get_workspace_status':
        result = await this.executeDaytonaGetWorkspaceStatus(context);
        break;
      case 'ensure_workspace_running':
        result = await this.executeEnsureWorkspaceRunning(tool.params, context);
        break;
      case 'restart_workspace':
        result = await this.executeRestartWorkspace(context);
        break;
      case 'daytona_read_file':
        result = await this.executeDaytonaReadFile(tool.params as ReadFileParams, context);
        break;
      case 'daytona_write_file':
        result = await this.executeDaytonaWriteFile(tool.params as WriteFileParams, context);
        break;
      case 'daytona_list_files':
        result = await this.executeDaytonaListFiles(tool.params as ListFilesParams, context);
        break;
      case 'daytona_get_preview_url':
        result = await this.executeDaytonaGetPreviewUrl(context);
        break;
      // PTY management tools
      case 'start_interactive_session':
        result = await this.executeStartInteractiveSession(tool.params as { command: string }, context);
        break;
      case 'send_pty_input':
        result = await this.executeSendPtyInput(tool.params as { sessionId: string; input: string }, context);
        break;
      case 'get_pty_status':
        result = await this.executeGetPtyStatus(tool.params as { sessionId: string }, context);
        break;
      case 'kill_pty_session':
        result = await this.executeKillPtySession(tool.params as { sessionId: string }, context);
        break;
      case 'list_pty_sessions':
        result = await this.executeListPtySessions(context);
        break;
      case 'start_dev_server':
        result = await this.executeStartDevServer(tool.params as { command?: string }, context);
        break;
      default:
        result = {
          tool_use_id: tool.id,
          content: `Unknown tool: ${tool.tool}`,
          error: 'Unknown tool',
        };
    }

    result.tool_use_id = tool.id;
    return result;
  }
}
