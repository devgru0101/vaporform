/**
 * Vaporform Agentic AI Chat API
 * Tool-based AI agent for code generation and manipulation
 * Inspired by KiloCode's architecture
 */

import { api, Header } from 'encore.dev/api';
import { secret } from 'encore.dev/config';
import { verifyClerkJWT } from '../shared/clerk-auth.js';
import { ensureProjectPermission } from '../projects/permissions.js';
import { ValidationError, toAPIError } from '../shared/errors.js';
import { getUserAnthropicKey } from '../users/secrets.js';
import type Anthropic from '@anthropic-ai/sdk';

// Define Anthropic API key secret
// Note: Secret names are globally unique - same secret value across all services
const anthropicAPIKey = secret("AnthropicAPIKey");

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
  {
    name: 'run_code',
    description: 'Execute code in the sandbox runtime. Supports Python, TypeScript, and JavaScript. Returns stdout, stderr, exit code, and matplotlib chart artifacts. Use for testing/validating code before deployment.',
    input_schema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'The code to execute',
        },
        language: {
          type: 'string',
          enum: ['python', 'typescript', 'javascript'],
          description: 'Programming language to use',
        },
        timeout: {
          type: 'number',
          description: 'Timeout in seconds (default: 30)',
          default: 30,
        },
      },
      required: ['code', 'language'],
    },
  },
  {
    name: 'edit_file',
    description: 'Make a targeted edit to a file by replacing old_text with new_text. More efficient than write_to_file for small changes. The old_text must match exactly.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The relative path to the file to edit',
        },
        old_text: {
          type: 'string',
          description: 'The exact text to find and replace (must match exactly including whitespace)',
        },
        new_text: {
          type: 'string',
          description: 'The new text to replace with',
        },
      },
      required: ['path', 'old_text', 'new_text'],
    },
  },
  {
    name: 'git_status',
    description: 'Get the current git status showing modified, added, and deleted files.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'git_commit',
    description: 'Commit all staged changes with a message. Automatically stages all modified files before committing.',
    input_schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'The commit message',
        },
      },
      required: ['message'],
    },
  },
  {
    name: 'git_log',
    description: 'Get the commit history for the project.',
    input_schema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of commits to return (default: 10)',
          default: 10,
        },
      },
    },
  },
  {
    name: 'git_diff',
    description: 'Show the diff of uncommitted changes.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Optional: Show diff for specific file',
        },
      },
    },
  },
  {
    name: 'install_package',
    description: 'Install a package using the project\'s package manager (npm, yarn, pnpm). Detects package manager automatically.',
    input_schema: {
      type: 'object',
      properties: {
        package: {
          type: 'string',
          description: 'Package name to install (e.g., "react", "express", "@types/node")',
        },
        dev: {
          type: 'boolean',
          description: 'Install as dev dependency',
          default: false,
        },
        version: {
          type: 'string',
          description: 'Specific version to install (e.g., "^18.0.0")',
        },
      },
      required: ['package'],
    },
  },
  {
    name: 'remove_package',
    description: 'Remove a package using the project\'s package manager.',
    input_schema: {
      type: 'object',
      properties: {
        package: {
          type: 'string',
          description: 'Package name to remove',
        },
      },
      required: ['package'],
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
  {
    name: 'ensure_workspace_running',
    description: 'Ensure the Daytona workspace is running before performing operations. Automatically starts stopped workspaces and recovers errored ones. Use this if you get "workspace not running" errors or before critical operations.',
    input_schema: {
      type: 'object',
      properties: {
        wait_for_ready: {
          type: 'boolean',
          description: 'Wait up to 60 seconds for workspace to reach running status (default: true)',
        },
      },
    },
  },
  {
    name: 'restart_workspace',
    description: 'Explicitly restart the Daytona workspace. Use when you need a fresh environment (e.g., after changing environment variables, installing system packages, or persistent errors). For most errors, use ensure_workspace_running instead.',
    input_schema: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description: 'Why the restart is needed (for logging and user communication)',
        },
      },
    },
  },
  {
    name: 'force_rebuild_workspace',
    description: 'DESTRUCTIVE: Delete the workspace and create a new one from scratch. Only use when the sandbox is corrupted beyond repair (e.g., broken dependencies, filesystem errors that restart cannot fix). All running processes will be terminated. Files are preserved via VFS backup and will be restored.',
    input_schema: {
      type: 'object',
      properties: {
        confirm: {
          type: 'boolean',
          description: 'Must be true to confirm this destructive operation',
        },
        reason: {
          type: 'string',
          description: 'Explain why force rebuild is necessary (required for audit trail)',
        },
      },
      required: ['confirm', 'reason'],
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
      console.log('[Agent Chat] Received request:', {
        projectId: req.projectId,
        messagesCount: req.messages?.length,
        hasTools: !!req.tools,
        stream: req.stream
      });

      const { userId } = await verifyClerkJWT(req.authorization);
      console.log('[Agent Chat] User ID:', userId);

      const projectId = BigInt(req.projectId);
      console.log('[Agent Chat] Project ID (bigint):', projectId, 'Type:', typeof projectId);

      await ensureProjectPermission(userId, projectId, 'view');
      console.log('[Agent Chat] Permission check passed');

      // Fetch project details including wizard data
      const { db } = await import('../projects/db.js');
      console.log('[Agent Chat] About to query project...');

      const project = await db.queryRow<{ name: string; description: string; wizard_data: string | null }>`
        SELECT name, description, wizard_data
        FROM projects
        WHERE id = ${projectId}
      `;

      console.log('[Agent Chat] Project query completed');

      if (!project) {
        throw new Error('Project not found');
      }

      const wizardData = project.wizard_data ? JSON.parse(project.wizard_data) : null;

      if (!req.messages || req.messages.length === 0) {
        throw toAPIError(new ValidationError('Messages array is required'));
      }

      // Fetch user's API key (encrypted) or fall back to system key
      let apiKey = await getUserAnthropicKey(userId);

      if (!apiKey) {
        // Fall back to system-wide Anthropic API key from Encore secrets
        apiKey = anthropicAPIKey();
      }

      if (!apiKey) {
        throw new Error('Anthropic API key not configured. Please add your API key in Settings or configure the system key.');
      }

      const Anthropic = (await import('@anthropic-ai/sdk')).default;
      const anthropic = new Anthropic({ apiKey });

      // Get relevant code from RAG based on user's message
      const lastUserMessage = req.messages[req.messages.length - 1];
      const userQuery = typeof lastUserMessage.content === 'string'
        ? lastUserMessage.content
        : JSON.stringify(lastUserMessage.content);

      const relevantCode = await searchRelevantCode(projectId, userQuery);

      // Build system prompt with project context
      let systemPrompt = `You are the Vaporform AI Code Engine, an expert coding assistant that generates complete, production-ready applications.

# YOUR ROLE
You are building project: "${project.name}"
${project.description ? `Description: ${project.description}` : ''}

${relevantCode.length > 0 ? `# RELEVANT CODE (from semantic search)
The following code snippets are semantically related to the user's request:

${relevantCode.map((r, idx) => `## Related Code ${idx + 1}: ${r.metadata.sourcePath}
Relevance Score: ${(r.score * 100).toFixed(1)}%
Language: ${r.metadata.language || 'unknown'}
\`\`\`
${r.content}
\`\`\`
`).join('\n')}

Use this existing code as context when responding to the user's request. Build upon it, reference it, or modify it as needed.

---
` : ''}

# ✅ VAPORFORM DAYTONA-FIRST WORKFLOW (ARCHITECTURAL REVERSAL)
1. You write files DIRECTLY to the Daytona sandbox using write_to_file (immediately executable!)
2. Files are automatically backed up to VFS (database) for persistence
3. Install dependencies as you build using execute_command (npm install, pip install, etc.)
4. Test your code in real-time - it's running in a live sandbox as you generate it!
5. Start the dev server when ready using execute_command (npm run dev, python app.py, etc.)
6. When done, use attempt_completion - Vaporform extracts the PUBLIC preview URL
7. Preview URLs are publicly accessible - no authentication needed!

# IMPORTANT RULES - DAYTONA-FIRST APPROACH
- DO write files with write_to_file - they go to the live Daytona sandbox FIRST (immediately runnable)
- DO install dependencies during generation using execute_command (npm install, pip install, etc.)
- DO build the project if needed using execute_command (npm run build, etc.)
- DO start the dev server when ready using execute_command (npm run dev, python app.py, etc.)
- DO test your code as you build - the sandbox is live and running!
- DO use attempt_completion when the application is fully generated and server is running
- NEVER wait to install deps or start servers - do it during generation!

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

## ✅ HOW FILE OPERATIONS WORK (DAYTONA-FIRST)
When you use **write_to_file**:
1. File is written to Daytona sandbox FIRST (immediately executable in live environment)
2. File is automatically backed up to VFS (database) for persistence
3. Code is instantly runnable - test it right away!

When you use **read_file**:
1. Reads from Daytona sandbox FIRST (latest live version)
2. Falls back to VFS if file doesn't exist in sandbox yet

**Key insight**: write_to_file creates LIVE, EXECUTABLE code in the running sandbox!

## ✅ FILE PATHS
- Paths are relative to project root (e.g., "src/index.ts", "package.json")
- Always provide line_count parameter for validation
- Write complete files in a single operation

## ✅ COMMANDS - YOU CONTROL THE SANDBOX
- DO run npm install, pip install, cargo build, etc. using execute_command
- DO start dev servers using execute_command (npm run dev, python app.py, etc.)
- DO test your code using execute_command (npm test, pytest, etc.)
- The sandbox is YOUR live development environment - use it!

## 🔧 WORKSPACE RECOVERY & STATUS MANAGEMENT
If you encounter "workspace not running" errors or operations fail:

1. **ensure_workspace_running** (PRIMARY TOOL - use this first!)
   - Automatically starts stopped workspaces
   - Recovers errored workspaces
   - Waits up to 60 seconds for workspace to be ready
   - Handles most issues automatically
   - Example: Use before critical operations or when errors occur

2. **restart_workspace** (for fresh environment)
   - Use when you need a clean slate (e.g., after changing environment variables)
   - Full restart cycle: stop → start
   - Waits up to 30 seconds for completion
   - Example: After installing system packages or persistent errors

3. **force_rebuild_workspace** (NUCLEAR OPTION - last resort only!)
   - DESTRUCTIVE: Deletes and recreates workspace from scratch
   - Only use when sandbox is corrupted beyond repair
   - Requires confirm: true and reason (safety check)
   - Restores files from VFS backup automatically
   - Example: Broken dependencies, filesystem corruption that restart cannot fix

**Best Practice**: Try ensure_workspace_running first, then restart_workspace if needed, and only use force_rebuild_workspace as a last resort.

**Note**: Most operations will work fine without these tools. Only use them if you actually encounter errors.`;

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
      // Convert to ValidationError (VaporformError type) before passing to toAPIError
      const err = error instanceof ValidationError ? error : new ValidationError(
        error instanceof Error ? error.message : 'Failed to process agent chat'
      );
      throw toAPIError(err);
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

/**
 * Search for relevant code using RAG (Retrieval Augmented Generation)
 * Returns semantically similar code chunks based on the query
 */
async function searchRelevantCode(
  projectId: bigint,
  query: string
): Promise<Array<{
  id: string;
  score: number;
  content: string;
  metadata: Record<string, any>;
}>> {
  try {
    const { qdrantManager } = await import('../vector/qdrant-manager.js');

    // Search for relevant code chunks
    const results = await qdrantManager.search(
      projectId,
      'code',
      query,
      5,        // Top 5 results
      0.65      // Lower threshold for broader matches
    );

    console.log(`[RAG Search] Found ${results.length} relevant code chunks for query: "${query.substring(0, 100)}..."`);

    return results;
  } catch (error) {
    console.error('[RAG Search] Error searching for relevant code:', error);
    // Return empty array on error - don't break the agent
    return [];
  }
}
