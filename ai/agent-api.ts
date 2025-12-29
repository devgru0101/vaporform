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

import { AGENT_TOOLS, DAYTONA_TOOLS } from './tool-definitions.js';

// Re-export for compatibility
export { AGENT_TOOLS, DAYTONA_TOOLS };

interface AgentChatRequest {
  authorization: Header<'Authorization'>;
  projectId: string;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string | any[];
  }>;
  model?: string;  // Optional: User-selected AI model
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
      let apiKey: string | null = null;
      try {
        apiKey = await getUserAnthropicKey(userId);
      } catch (error) {
        console.warn('[Agent Chat] Failed to fetch user API key (likely encryption error):', error);
        // Continue to fall back to system key
      }

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

      const { mem0Manager } = await import('./memory/mem0-manager.js');

      // MEM0 INTEGRATION - Retrieve context
      let mem0Context = '';
      try {
        console.log('[Mem0] Searching for memories:', userQuery);
        const memories = await mem0Manager.searchMemory(userId, userQuery);

        if (memories && memories.length > 0) {
          console.log(`[Mem0] Found ${memories.length} memories`);
          mem0Context = memories.map((m: any) => `- ${m}`).join('\n');
        }
      } catch (error) {
        console.warn('[Mem0] Failed to search memories:', error);
      }

      // Build system prompt with project context
      let systemPrompt = `You are the Vaporform AI Code Engine, an expert coding assistant that generates complete, production-ready applications.

# YOUR ROLE
You are building project: "${project.name}"
${project.description ? `Description: ${project.description}` : ''}

${mem0Context ? `# USER MEMORY & CONTEXT (from Mem0)
The following insights are verified from previous interactions with this user:
${mem0Context}

Use these memories to personalize your response and maintain continuity.
` : ''}

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

# ✅ VAPORFORM DAYTONA-FIRST WORKFLOW
1. **PLAN FIRST**: Use 'submit_implementation_plan' tool with your detailed plan in Markdown format.
   - DO NOT echo or repeat the plan in your response text
   - Just say: "I've submitted an implementation plan for your review."
   - The tool will display the plan in a formatted card
2. **WAIT FOR APPROVAL**: Do not proceed until the user approves the plan.
3. **WRITE ALL FILES**: Once approved, write ALL project files using daytona_write_file
4. **INSTALL DEPENDENCIES**: Run dependency installation (npm install, pip install -r requirements.txt)
5. **START DEV SERVER IN BACKGROUND**: Use PTY session to run dev server asynchronously
6. **GET PREVIEW URL**: Preview URL is available on ports 3000-9999 with listeners
7. **COMPLETE**: Use 'attempt_completion' when done with preview URL

# IMPORTANT RULES - DAYTONA WORKFLOW
When working in the Daytona sandbox:
- **WRITE ALL FILES FIRST**: Complete all file writing before installing dependencies or starting servers
- **DO** install dependencies after writing files (npm install, pip install, etc.)
- **DO** start dev server in BACKGROUND using PTY session (NOT regular execute_command)
- **DO NOT** run production builds ('npm run build') - dev server handles everything
- **DO NOT** use regular execute_command for long-running processes - use PTY sessions
- **DO** use attempt_completion when dev server is running and preview URL is available

# DEV SERVER WORKFLOW - PTY (Pseudo Terminal) API
For starting development servers (npm run dev, python app.py, etc.):

IMPORTANT: These tools use Daytona's PTY API for interactive execution.
PTY API ≠ Sessions API (Sessions API is only for tracking processes, NOT executing them)

Workflow:
1. **Create PTY Handle**: daytona_create_session({session_id: "dev-server"})  
   → Creates interactive PTY handle for command execution
   
2. **Execute Command**: daytona_session_exec({session_id: "dev-server", input: "cd /home/daytona && npm run dev\\n"})  
   → Sends command to PTY (MUST include \\n at end!)
   
3. **Set Preview Port**: daytona_set_preview_port({port: 5173})  
   → Configures which port to use for preview URL
   
4. **Get Preview URL**: daytona_get_preview_url()  
   → Returns {url, token, port} from Daytona SDK

5. **Verify**: daytona_get_workspace_status()  
   → Check detected_ports array to confirm server is running

Common framework ports:
- Vite/React: 5173 | Next.js/CRA: 3000 | Vue CLI: 8080
- Angular: 4200 | Django: 8000 | Flask: 5000 | Astro: 4321

CRITICAL: Always append \\n to commands in daytona_session_exec
CRITICAL: Call daytona_set_preview_port BEFORE daytona_get_preview_url


# ERROR HANDLING - CRITICAL
When encountering errors, handle them intelligently and continue progress:
- **"File not found"**: The file doesn't exist yet - CREATE it using daytona_write_file instead of retrying the read
- **"Directory not found"**: Create parent directories first using execute_command (mkdir -p path/to/dir)
- **"Command not found"**: Install the required package/tool first (npm install -g, apt-get install, etc.)
- **"Module not found"**: Install dependencies (npm install, pip install) before running
- **"Permission denied"**: Check file permissions or use appropriate commands (chmod, sudo if needed)
- **NEVER** repeat the same failing operation - analyze the error and take corrective action
- **ALWAYS** move forward - errors are expected in development, handle them and proceed

# AVAILABLE TOOLS

## VFS Tools (for creating project files):
- read_file: Read existing files in the project VFS
- write_to_file: Create new files in the project VFS (provide complete content, never truncate)
- list_files: List files and directories in the VFS
- search_files: Search for files by pattern in the VFS
- ask_followup_question: Ask the user for clarification (use sparingly)
- attempt_completion: Mark the project as complete (required when done)

## **Daytona Sandbox Tools (for code execution in isolated environment):**
- daytona_execute_command: Execute shell commands in the sandbox
- daytona_read_file: Read file contents from sandbox
- daytona_write_file: Write/update files in sandbox
- daytona_list_files: List directory contents in sandbox
- daytona_set_preview_port: **CRITICAL: Set preview port immediately after detecting dev server port**
- daytona_get_preview_url: Get live preview URL for the application
- daytona_git_clone: Clone a Git repository into sandbox
- daytona_get_workspace_status: Check if sandbox is running

**Preview URL Workflow (IMPORTANT):**
When starting a dev server, follow this exact sequence:
1. Start dev server in background: daytona_execute_command with "npm run dev &" or similar
2. Parse command output to detect the port (e.g., "Local: http://localhost:5173/" = port 5173)
3. Immediately call daytona_set_preview_port with the detected port number
4. Then call daytona_get_preview_url to get the shareable preview link
5. Provide the preview URL to the user

Common ports: Vite=5173, Next.js=3000, Angular=4200, Django=8000, Flask=5000

## 🔍 CRITICAL: Result Verification Protocol

**When tools return success but don't have expected effect:**
1. ✅ **Verify** - Call the getter tool again to confirm change persisted
2. ❌ **Detect Inconsistency** - If results don't match what you just set, STOP
3. 🐛 **Debug First** - Check logs, don't create workarounds
4. ❓ **Ask User** - Use ask_followup_question to report the tool bug

**Example of what to do:**
\`\`\`
set_preview_port(5173) → success
get_preview_url() → port 3000  ← INCONSISTENT!

❌ DON'T: Build proxy server to forward 3000 → 5173
✅ DO: Tell user "Tool bug detected: set_preview_port succeeded but get_preview_url still returns port 3000. The correct URL should be https://5173-[id].proxy.daytona.works"
\`\`\`

**Red Flags (tool may have failed silently):**
- Tool returns success but state doesn't change
- Setter/getter tools return different values
- File writes succeed but reads show old content

## 🛠️ Problem-Solving Hierarchy

When encountering issues, follow this order:

1. **Verify First** - Confirm tool actually worked (call getter after setter)
2. **Report Bugs** - If tool failed, tell user the bug (don't workaround)
3. **Simple Solutions** - Prefer: config change > code change > installing packages
4. **Last Resort** - Only create workarounds if user explicitly requests

**Bad Example:**
\`\`\`
Port mismatch → Install http-proxy → Create proxy server → Forward traffic
(10+ tool calls, wasteful)
\`\`\`

**Good Example:**
\`\`\`
Port mismatch → Tell user correct URL (1 message, helpful)
\`\`\`

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

      // Fetch user settings for model preference via Users Service API
      const { getUserSettings } = await import('../users/settings-api.js');
      const { settings } = await getUserSettings({ authorization: req.authorization });

      // Priority: Request model > User settings > Default (latest Sonnet 4.5)
      let selectedModel = req.model || settings?.aiModel || 'claude-sonnet-4-5-20250929';

      // Automatically upgrade deprecated models to current default
      const deprecatedModels = ['claude-3-5-sonnet-20240620', 'claude-3-5-sonnet-20241022'];
      if (deprecatedModels.includes(selectedModel)) {
        console.warn(`[Agent Chat] Upgrading deprecated model ${selectedModel} to claude-sonnet-4-5-20250929`);
        selectedModel = 'claude-sonnet-4-5-20250929';
      }

      console.log('[Agent Chat] Using model:', selectedModel);

      // Call Anthropic API with tools
      const response = await anthropic.messages.create({
        model: selectedModel,
        max_tokens: 8192,
        system: systemPrompt,
        messages: anthropicMessages,
        tools: allTools,
      });

      // MEM0 INTEGRATION - Save interaction
      if (response.content) {
        try {
          const { mem0Manager } = await import('./memory/mem0-manager.js');

          let aiText = '';
          if (typeof response.content === 'string') {
            aiText = response.content;
          } else if (Array.isArray(response.content)) {
            // Extract text from content blocks
            aiText = response.content
              .filter((b: any) => b.type === 'text')
              .map((b: any) => b.text)
              .join('\n');
          }

          if (aiText) {
            console.log('[Mem0] Saving interaction...');
            // We fire and forget this promise to not block the response
            mem0Manager.addMemory(userId, `User Request: ${userQuery}\n\nAI Response: ${aiText}`)
              .then(() => console.log('[Mem0] Interaction saved'))
              .catch(err => {
                console.error('[Mem0] Failed to save interaction:', err instanceof Error ? err.message : String(err));
              });
          }
        } catch (error) {
          console.error('[Mem0] Error saving interaction:', error instanceof Error ? error.message : String(error));
        }
      }

      return {
        content: response.content,
        stop_reason: response.stop_reason || undefined,
        usage: {
          input_tokens: response.usage.input_tokens,
          output_tokens: response.usage.output_tokens,
        },
      };
    } catch (error) {
      // Convert specific Anthropic errors
      if (error instanceof Error && error.name === 'AuthenticationError') {
        // Log the full error but return a clean message
        console.error('Anthropic Auth Error:', error);
        throw new ValidationError('AI Service Authentication Failed. Please check your API key settings.');
      }

      const err = error instanceof ValidationError ? error : new ValidationError(
        error instanceof Error ? error.message : 'Failed to process agent chat'
      );
      console.error('[Agent Chat] Final API Error:', {
        message: err.message,
        details: err.details,
        stack: error instanceof Error ? error.stack : undefined
      });
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
    console.log(`[Tool Exec] Request: ${toolName} for project ${projectId}`, JSON.stringify(toolInput).substring(0, 200));

    try {
      const { userId } = await verifyClerkJWT(authorization);
      const id = BigInt(projectId);

      await ensureProjectPermission(userId, id, 'view');

      const { executeDaytonaTool: executeToolHandler } = await import('./daytona-tools.js');
      const result = await executeToolHandler(toolName, toolInput, id);

      console.log(`[Tool Exec] Success: ${toolName}`, result.success ? 'OK' : 'Failed');
      return result;
    } catch (error) {
      console.error(`[Tool Exec] Failed: ${toolName}`, error);
      throw error;
    }
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

// List available AI models
interface ListModelsResponse {
  models: Array<{
    id: string;
    name: string;
    description: string;
    provider: string;
  }>;
}

export const listAvailableModels = api(
  { method: 'GET', path: '/ai/models' },
  async (req: { authorization: Header<'Authorization'> }): Promise<ListModelsResponse> => {
    await verifyClerkJWT(req.authorization);

    return {
      models: [
        {
          id: 'claude-opus-4-5-20251124',
          name: 'Claude Opus 4.5',
          description: 'Most powerful model - advanced reasoning (Nov 2025)',
          provider: 'anthropic'
        },
        {
          id: 'claude-sonnet-4-5-20250929',
          name: 'Claude Sonnet 4.5',
          description: 'Latest balanced model - best overall (Sept 2025)',
          provider: 'anthropic'
        },
        {
          id: 'claude-haiku-4-5-20251015',
          name: 'Claude Haiku 4.5',
          description: 'Fastest and most cost-efficient (Oct 2025)',
          provider: 'anthropic'
        },
        {
          id: 'claude-3-5-sonnet-20241022',
          name: 'Claude 3.5 Sonnet',
          description: 'Previous generation - stable (Oct 2024)',
          provider: 'anthropic'
        }
      ]
    };
  }
);
