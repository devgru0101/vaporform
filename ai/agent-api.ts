/**
 * Vaporform Agentic AI Chat API
 * Tool-based AI agent for code generation and manipulation
 * Inspired by KiloCode's architecture
 */

import { api, Header } from 'encore.dev/api';
import { verifyClerkJWT } from '../shared/clerk-auth.js';
import { ensureProjectPermission } from '../projects/permissions.js';
import { ValidationError, toAPIError } from '../shared/errors.js';
import { db as usersDb } from '../users/db.js';

// Tool definitions
const AGENT_TOOLS: any[] = [
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
];

// Daytona MCP Tools for sandbox interaction
const DAYTONA_TOOLS: any[] = [
  {
    name: 'daytona_execute_command',
    description: 'Execute a shell command in the project\'s Daytona sandbox. Use this to run builds, tests, install packages, start servers, or debug issues in the running environment.',
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
    name: 'daytona_read_file',
    description: 'Read a file from the Daytona sandbox. Use this to inspect files in the actual running environment, check generated files, or debug issues.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file in the sandbox (relative to workspace root)',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'daytona_write_file',
    description: 'Write a file to the Daytona sandbox. Use this to create or update files in the running environment.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path where the file should be written in the sandbox',
        },
        content: {
          type: 'string',
          description: 'Content to write to the file',
        },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'daytona_list_files',
    description: 'List files in the Daytona sandbox. Use this to explore the directory structure of the running environment.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Directory path to list (defaults to workspace root)',
        },
      },
    },
  },
  {
    name: 'daytona_get_preview_url',
    description: 'Get the preview URL for the running application in the Daytona sandbox. Use this to provide the user with a link to view their application.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'daytona_git_clone',
    description: 'Clone a Git repository into the Daytona sandbox workspace.',
    input_schema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Git repository URL',
        },
        path: {
          type: 'string',
          description: 'Target directory in sandbox',
        },
        branch: {
          type: 'string',
          description: 'Branch to clone (optional)',
        },
      },
      required: ['url', 'path'],
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
];

interface AgentChatRequest {
  authorization: Header<'Authorization'>;
  projectId: string;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string | any[];
  }>;
  tools?: any[];
  toolResult?: any;
  stream?: boolean;
}

interface AgentChatResponse {
  content: string | any[];
  stop_reason?: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

/**
 * Agent chat endpoint - supports tool-based AI interactions
 */
export const agentChat = api(
  { method: 'POST', path: '/ai/agent/chat' },
  async (req: AgentChatRequest): Promise<AgentChatResponse> => {
    try {
      const { userId } = await verifyClerkJWT(req.authorization);
      const projectId = BigInt(req.projectId);

      await ensureProjectPermission(userId, projectId, 'view');

      // Fetch project details including wizard data
      const { db } = await import('../projects/db.js');
      const project = await db.queryRow<{ name: string; description: string; wizard_data: string | null }>`
        SELECT name, description, wizard_data
        FROM projects
        WHERE id = ${projectId}
      `;

      if (!project) {
        throw new Error('Project not found');
      }

      const wizardData = project.wizard_data ? JSON.parse(project.wizard_data) : null;

      if (!req.messages || req.messages.length === 0) {
        throw toAPIError(new ValidationError('Messages array is required'));
      }

      // Fetch user's API key from database
      let apiKey = process.env.ANTHROPIC_API_KEY; // Fallback to env var

      const apiKeyResults: { secret_value: string }[] = [];
      for await (const row of usersDb.query<{ secret_value: string }>`
        SELECT secret_value
        FROM user_secrets
        WHERE user_id = ${userId} AND secret_key = 'anthropic_api_key'
      `) {
        apiKeyResults.push(row);
      }

      if (apiKeyResults.length > 0) {
        apiKey = apiKeyResults[0].secret_value;
      }

      if (!apiKey) {
        throw new Error('Anthropic API key not configured. Please add your API key in Settings.');
      }

      const Anthropic = (await import('@anthropic-ai/sdk')).default;
      const anthropic = new Anthropic({ apiKey });

      // Build system prompt with project context
      let systemPrompt = `You are the Vaporform AI Code Engine, an expert coding assistant that generates complete, production-ready applications.

# YOUR ROLE
You are building project: "${project.name}"
${project.description ? `Description: ${project.description}` : ''}

# VAPORFORM WORKFLOW
1. You create complete project files using write_to_file
2. When done, use attempt_completion to signal completion
3. Vaporform automatically builds your project in a Daytona.io sandbox
4. The live preview URL is extracted and shown to the user

# IMPORTANT RULES
- NEVER ask questions about setup or installation - everything is provided
- NEVER suggest manual installation steps - just create the files
- DO create complete, working applications with all necessary files
- DO use write_to_file to create every file the project needs
- DO include package.json, configuration files, and all dependencies
- DO use attempt_completion when all files are created

# AVAILABLE TOOLS

## VFS Tools (for creating project files):
- read_file: Read existing files in the project VFS
- write_to_file: Create new files in the project VFS (provide complete content, never truncate)
- list_files: List files and directories in the VFS
- search_files: Search for files by pattern in the VFS
- ask_followup_question: Ask the user for clarification (use sparingly)
- attempt_completion: Mark the project as complete (required when done)

## Daytona Sandbox Tools (for testing and debugging):
- daytona_execute_command: Execute shell commands in the live Daytona sandbox
- daytona_read_file: Read files from the running sandbox environment
- daytona_write_file: Write files to the running sandbox
- daytona_list_files: List files in the sandbox
- daytona_get_preview_url: Get the live preview URL for the application
- daytona_git_clone: Clone Git repositories into the sandbox
- daytona_get_workspace_status: Check if the Daytona workspace is running

## IMPORTANT: Two File Systems
1. **VFS (Virtual File System)**: Use write_to_file to create project files. These are stored in the database.
2. **Daytona Sandbox**: Use daytona_write_file to modify files in the running environment for testing/debugging.

When creating a new project, use write_to_file. When debugging or testing, use the daytona_* tools.

# FILE OPERATIONS
- All files you create go into the project's virtual file system (VFS)
- Paths are relative to project root (e.g., "src/index.ts", "package.json")
- Always provide line_count parameter for validation
- Write complete files in a single operation

# COMMANDS
- You do NOT need to run npm install, build commands, or start dev servers
- Vaporform handles all building and deployment automatically
- Focus on creating the application code and configuration files`;

      // Add wizard data if available
      if (wizardData) {
        systemPrompt += `\n\n# PROJECT REQUIREMENTS (from wizard)\n${JSON.stringify(wizardData, null, 2)}`;
      }

      systemPrompt += `\n\nNow, create the complete application based on the user's requirements. Start by creating all necessary files.`;

      // Convert messages to Anthropic format
      const anthropicMessages: Anthropic.MessageParam[] = req.messages.map(msg => ({
        role: msg.role,
        content: typeof msg.content === 'string' ? msg.content : msg.content,
      }));

      console.log('[Agent Chat] Messages from frontend:', JSON.stringify(req.messages, null, 2));
      console.log('[Agent Chat] Final messages to Anthropic:', JSON.stringify(anthropicMessages, null, 2));

      // Combine VFS tools and Daytona tools
      const allTools = [...AGENT_TOOLS, ...DAYTONA_TOOLS];

      // Call Anthropic API with tools
      const response = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 8192,
        system: systemPrompt,
        messages: anthropicMessages,
        tools: allTools,
      });

      return {
        content: response.content,
        stop_reason: response.stop_reason || undefined,
        usage: {
          input_tokens: response.usage.input_tokens,
          output_tokens: response.usage.output_tokens,
        },
      };
    } catch (error) {
      console.error('Error in agent chat:', error);
      throw toAPIError(error instanceof Error ? error : new Error('Failed to process agent chat'));
    }
  }
);

/**
 * Get tool definitions for the agent
 */
export const getAgentTools = api(
  { method: 'GET', path: '/ai/agent/tools' },
  async ({ authorization }: { authorization: Header<'Authorization'> }): Promise<{ tools: any[] }> => {
    await verifyClerkJWT(authorization);
    return { tools: [...AGENT_TOOLS, ...DAYTONA_TOOLS] };
  }
);

/**
 * Execute a Daytona tool
 */
export const executeDaytonaTool = api(
  { method: 'POST', path: '/ai/agent/daytona-tool' },
  async ({
    authorization,
    projectId,
    toolName,
    toolInput,
  }: {
    authorization: Header<'Authorization'>;
    projectId: string;
    toolName: string;
    toolInput: any;
  }): Promise<{ success: boolean; result?: any; error?: string }> => {
    const { userId } = await verifyClerkJWT(authorization);
    const id = BigInt(projectId);

    await ensureProjectPermission(userId, id, 'view');

    const { executeDaytonaTool: executeToolHandler } = await import('./daytona-tools.js');
    const result = await executeToolHandler(toolName, toolInput, id);

    return result;
  }
);

/**
 * Get generation job status and progress
 */
export const getGenerationStatus = api(
  { method: 'GET', path: '/ai/generation/:projectId/status' },
  async ({
    authorization,
    projectId,
  }: {
    authorization: Header<'Authorization'>;
    projectId: string;
  }): Promise<{
    status: string;
    progress: number;
    currentStep: string | null;
    error: string | null;
    recentLogs: Array<{
      tool_name: string;
      message: string;
      level: string;
      created_at: Date;
    }>;
  }> => {
    const { userId } = await verifyClerkJWT(authorization);
    const id = BigInt(projectId);

    await ensureProjectPermission(userId, id, 'view');

    // Import the project generator functions
    const { db } = await import('../projects/db.js');

    // Get the most recent generation job for this project
    const job = await db.queryRow<{
      id: bigint;
      status: string;
      progress: number;
      current_step: string | null;
      error_message: string | null;
    }>`
      SELECT id, status, progress, current_step, error_message
      FROM generation_jobs
      WHERE project_id = ${id}
      ORDER BY created_at DESC
      LIMIT 1
    `;

    if (!job) {
      // No generation job found - project may not be generating
      return {
        status: 'not_started',
        progress: 0,
        currentStep: null,
        error: null,
        recentLogs: [],
      };
    }

    // Get recent logs for this job
    const logs: Array<{
      tool_name: string;
      message: string;
      level: string;
      created_at: Date;
    }> = [];

    for await (const log of db.query<{
      tool_name: string;
      message: string;
      level: string;
      created_at: Date;
    }>`
      SELECT tool_name, message, level, created_at
      FROM generation_logs
      WHERE job_id = ${job.id}
      ORDER BY created_at DESC
      LIMIT 20
    `) {
      logs.push(log);
    }

    return {
      status: job.status,
      progress: job.progress,
      currentStep: job.current_step,
      error: job.error_message,
      recentLogs: logs.reverse(), // Return in chronological order
    };
  }
);
