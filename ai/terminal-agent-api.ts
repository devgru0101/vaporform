/**
 * Terminal Agent API
 * AI-powered terminal agent with OpenCode-style tool execution
 * Integrates with unified context manager for cross-agent awareness
 */

import { api } from 'encore.dev/api';
import { secret } from 'encore.dev/config';
import Anthropic from '@anthropic-ai/sdk';
import { verifyClerkJWT } from '../shared/clerk-auth.js';
import { ensureProjectPermission } from '../projects/permissions.js';
import { contextManager } from './context-manager.js';
import { terminalAgentTools } from './terminal-agent-tools.js';
import { getUserAnthropicKey } from '../users/secrets.js';

// Define Anthropic API key secret
const anthropicAPIKey = secret("AnthropicAPIKey");

// ============================================================================
// Types
// ============================================================================

export interface TerminalAgentRequest {
  authorization: string;
  projectId: bigint;
  sessionId?: bigint; // Optional: reuse existing session
  message: string;
  workspaceId?: bigint; // For executing commands in Daytona workspace
}

export interface TerminalAgentResponse {
  sessionId: bigint;
  response: string;
  toolsUsed: Array<{
    name: string;
    input: any;
    output: any;
    status: 'success' | 'error';
  }>;
  context: {
    filesAccessed: string[];
    commandsRun: string[];
    errorsEncountered: string[];
  };
}

// ============================================================================
// API Endpoints
// ============================================================================

/**
 * Send a message to the terminal agent
 * The agent can execute bash commands, read/write files, and access terminal context
 */
export const terminalAgentChat = api(
  { method: 'POST', path: '/ai/terminal-agent/chat', expose: true },
  async (req: TerminalAgentRequest): Promise<TerminalAgentResponse> => {
    // Verify authentication
    const { userId } = await verifyClerkJWT(req.authorization);

    // Verify project access
    await ensureProjectPermission(userId, req.projectId, 'view');

    console.log(`[Terminal Agent] User ${userId} sending message to project ${req.projectId}`);

    // Get or create session
    let sessionId = req.sessionId;
    if (!sessionId) {
      const session = await contextManager.createSession(
        req.projectId,
        userId,
        'terminal',
        'Terminal Agent Session',
        { workspaceId: req.workspaceId }
      );
      sessionId = session.id;
    }

    // Get API key (user's key or system key)
    let apiKey = await getUserAnthropicKey(userId);

    if (!apiKey) {
      apiKey = anthropicAPIKey();
    }

    if (!apiKey) {
      throw new Error('Anthropic API key not configured. Please add your API key in Settings or configure the system key.');
    }

    const anthropic = new Anthropic({ apiKey });

    // Build system prompt with cross-agent context
    const systemPrompt = await buildTerminalAgentPrompt(req.projectId, req.workspaceId);

    // Get conversation history
    const history = await contextManager.getMessages(sessionId);

    // Clean messages for Claude API - remove tool_use blocks without corresponding tool_result
    const cleanMessagesForClaude = (msgs: any[]) => {
      const cleaned: Anthropic.MessageParam[] = [];

      for (let i = 0; i < msgs.length; i++) {
        const msg = msgs[i];
        const nextMsg = msgs[i + 1];

        // Parse content if it's a JSON string
        let content = msg.content;
        if (typeof content === 'string' && (content.startsWith('[') || content.startsWith('{'))) {
          try {
            content = JSON.parse(content);
          } catch {
            // Keep as string if parsing fails
          }
        }

        // Check if this message has a tool_use block
        const hasToolUse = Array.isArray(content) &&
          content.some((block: any) => block.type === 'tool_use');

        if (hasToolUse) {
          // This message has tool_use - check if next message has tool_result
          let nextContent = nextMsg?.content;
          if (typeof nextContent === 'string' && (nextContent.startsWith('[') || nextContent.startsWith('{'))) {
            try {
              nextContent = JSON.parse(nextContent);
            } catch {
              // Keep as string
            }
          }

          const nextHasToolResult = nextMsg &&
            Array.isArray(nextContent) &&
            nextContent.some((block: any) => block.type === 'tool_result');

          if (nextHasToolResult) {
            // Valid tool_use/tool_result pair - include both
            cleaned.push({
              role: msg.role as 'user' | 'assistant',
              content
            });
          } else {
            // tool_use without tool_result - extract just the text if present
            const textBlocks = Array.isArray(content)
              ? content.filter((block: any) => block.type === 'text')
              : [];

            if (textBlocks.length > 0) {
              cleaned.push({
                role: msg.role as 'user' | 'assistant',
                content: textBlocks.map((b: any) => b.text).join('\n')
              });
            }
          }
        } else {
          // Regular message without tool_use - include as-is
          cleaned.push({
            role: msg.role as 'user' | 'assistant',
            content
          });
        }
      }

      return cleaned;
    };

    // Build messages array
    const messages: Anthropic.MessageParam[] = [
      ...cleanMessagesForClaude(history),
      {
        role: 'user',
        content: req.message
      }
    ];

    // Track tool usage
    const toolsUsed: Array<{
      name: string;
      input: any;
      output: any;
      status: 'success' | 'error';
    }> = [];

    const filesAccessed: string[] = [];
    const commandsRun: string[] = [];
    const errorsEncountered: string[] = [];

    // Save user message
    await contextManager.addMessage(sessionId, 'user', req.message, {
      agentType: 'terminal'
    });

    // Agentic loop with tool use
    let response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 8192,
      system: systemPrompt,
      messages,
      tools: terminalAgentTools.getToolDefinitions()
    });

    let finalResponse = '';
    let iterations = 0;
    const maxIterations = 15;

    while (iterations < maxIterations) {
      iterations++;

      // Process response
      for (const block of response.content) {
        if (block.type === 'text') {
          finalResponse += block.text;
        } else if (block.type === 'tool_use') {
          console.log(`[Terminal Agent] Executing tool: ${block.name}`);

          try {
            // Execute tool
            const toolResult = await terminalAgentTools.executeTool(
              block.name,
              block.input,
              {
                projectId: req.projectId,
                sessionId,
                workspaceId: req.workspaceId,
                userId
              }
            );

            // Track tool usage
            toolsUsed.push({
              name: block.name,
              input: block.input,
              output: toolResult,
              status: 'success'
            });

            // Track context
            if (block.name === 'read_file' || block.name === 'write_file' || block.name === 'edit_file') {
              const path = (block.input as any).path;
              if (path && !filesAccessed.includes(path)) {
                filesAccessed.push(path);
              }
            }

            if (block.name === 'bash') {
              const command = (block.input as any).command;
              if (command) {
                commandsRun.push(command);
              }
            }

            // Save tool execution to context
            await contextManager.addMessage(sessionId, 'tool', JSON.stringify(toolResult), {
              agentType: 'terminal',
              contentType: 'json',
              toolName: block.name,
              toolInput: block.input as Record<string, any>,
              toolOutput: toolResult,
              toolStatus: 'success'
            });

            // Update context items
            if (block.name === 'read_file') {
              await contextManager.upsertContextItem(
                req.projectId,
                'file',
                (block.input as any).path,
                JSON.stringify(toolResult),
                { accessedByTerminalAgent: true }
              );
            }

            if (block.name === 'bash') {
              await contextManager.upsertContextItem(
                req.projectId,
                'terminal_output',
                `cmd_${Date.now()}`,
                JSON.stringify({
                  command: (block.input as any).command,
                  output: toolResult
                }),
                { executedByAgent: true }
              );
            }

            // Continue conversation with tool result
            messages.push({
              role: 'assistant',
              content: response.content
            });

            messages.push({
              role: 'user',
              content: [{
                type: 'tool_result',
                tool_use_id: block.id,
                content: JSON.stringify(toolResult)
              }]
            });

          } catch (error: any) {
            console.error(`[Terminal Agent] Tool execution error:`, error);

            const errorMsg = error instanceof Error ? error.message : String(error);
            errorsEncountered.push(`${block.name}: ${errorMsg}`);

            toolsUsed.push({
              name: block.name,
              input: block.input,
              output: { error: errorMsg },
              status: 'error'
            });

            // Save error to context
            await contextManager.addMessage(sessionId, 'tool', errorMsg, {
              agentType: 'terminal',
              contentType: 'error',
              toolName: block.name,
              toolInput: block.input as Record<string, any>,
              toolOutput: { error: errorMsg },
              toolStatus: 'error'
            });

            await contextManager.upsertContextItem(
              req.projectId,
              'error',
              `error_${Date.now()}`,
              errorMsg,
              { tool: block.name, terminalAgent: true }
            );

            // Continue conversation with error
            messages.push({
              role: 'assistant',
              content: response.content
            });

            messages.push({
              role: 'user',
              content: [{
                type: 'tool_result',
                tool_use_id: block.id,
                content: JSON.stringify({ error: errorMsg }),
                is_error: true
              }]
            });
          }
        }
      }

      // Check if we're done (no more tool calls)
      const hasToolUse = response.content.some(block => block.type === 'tool_use');
      if (!hasToolUse) {
        break;
      }

      // Get next response from Claude
      response = await anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 8192,
        system: systemPrompt,
        messages,
        tools: terminalAgentTools.getToolDefinitions()
      });
    }

    // Save assistant response
    await contextManager.addMessage(sessionId, 'assistant', finalResponse, {
      agentType: 'terminal',
      metadata: {
        toolsUsed: toolsUsed.length,
        iterations
      }
    });

    console.log(`[Terminal Agent] Completed after ${iterations} iterations, ${toolsUsed.length} tools used`);

    return {
      sessionId,
      response: finalResponse,
      toolsUsed,
      context: {
        filesAccessed,
        commandsRun,
        errorsEncountered
      }
    };
  }
);

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build system prompt with cross-agent context awareness
 */
async function buildTerminalAgentPrompt(
  projectId: bigint,
  workspaceId?: bigint
): Promise<string> {
  // Get cross-agent context
  const crossContext = await contextManager.getCrossAgentContext(projectId);

  // Get RAG results for recent activity
  const { qdrantManager } = await import('../vector/qdrant-manager.js');
  let ragResults: any[] = [];

  try {
    ragResults = await qdrantManager.search(
      projectId,
      'code',
      'recent terminal activity commands errors',
      3,
      0.6
    );
  } catch (error) {
    console.warn('[Terminal Agent] Could not fetch RAG results:', error);
  }

  return `You are an AI-powered terminal assistant integrated into Vaporform, a cloud-based development platform.

# Your Capabilities

You have access to powerful tools for terminal operations, file management, and code analysis:

1. **bash** - Execute bash commands in the project workspace
2. **read_file** - Read file contents
3. **write_file** - Write content to files
4. **edit_file** - Make targeted edits to files
5. **glob** - Find files by pattern
6. **grep** - Search file contents
7. **ls** - List directory contents

# Environment Context

- Project ID: ${projectId}
- Workspace ID: ${workspaceId || 'N/A'}
- Platform: Vaporform Cloud Development Environment
- All commands execute in isolated Daytona sandbox (if workspace configured)

# Cross-Agent Context Awareness

You share context with the code generation agent. Here's what else is happening in this project:

## Recent Code Generation Activity
${crossContext.recentCodeActivity.length > 0 ? crossContext.recentCodeActivity.slice(0, 5).map(msg =>
  `- [${msg.created_at.toISOString()}] ${msg.role}: ${msg.content.substring(0, 200)}${msg.content.length > 200 ? '...' : ''}`
).join('\n') : 'No recent code generation activity'}

## Recent Errors
${crossContext.sharedErrors.length > 0 ? crossContext.sharedErrors.slice(0, 3).map(err =>
  `- ${err.item_key}: ${err.content.substring(0, 150)}`
).join('\n') : 'No recent errors'}

## Active Jobs
${crossContext.activeJobs.length > 0 ? crossContext.activeJobs.map(job =>
  `- ${job.job_type}: ${job.description || 'N/A'} (${job.status}, ${job.progress_percentage}%)`
).join('\n') : 'No active jobs'}

## Recently Modified Files
${crossContext.sharedFiles.length > 0 ? crossContext.sharedFiles.slice(0, 10).map(file =>
  `- ${file.item_key} (accessed ${file.access_count} times)`
).join('\n') : 'No recently modified files'}

${ragResults.length > 0 ? `
## Relevant Code Context (from semantic search)
${ragResults.map((r, idx) => `
### Related Code ${idx + 1}: ${r.metadata.sourcePath || 'unknown'}
Relevance: ${(r.score * 100).toFixed(1)}%
\`\`\`
${r.content.substring(0, 500)}${r.content.length > 500 ? '...' : ''}
\`\`\`
`).join('\n')}
` : ''}

# Guidelines

1. **Be Proactive**: Use your tools to gather information before answering
2. **Context-Aware**: Consider recent code changes and errors when helping debug
3. **Safe Execution**: Always explain what commands will do before running destructive operations
4. **Efficient**: Use the right tool for the job (grep for searching, glob for finding files, etc.)
5. **Collaborative**: You're working alongside the code generation agent - be aware of its recent actions

# Response Style

- Provide clear, concise explanations
- Show command output when relevant
- Suggest next steps or related actions
- Alert user to potential issues or conflicts with recent code changes

You are a professional, helpful terminal assistant with full awareness of the broader development context.`;
}
