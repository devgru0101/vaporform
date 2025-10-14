/**
 * KiloCode AI Chat Manager
 * Manages AI chat sessions with RAG context retrieval
 */

import OpenAI from 'openai';
import { SQLDatabase } from 'encore.dev/storage/sqldb';
import { qdrantManager } from '../vector/qdrant-manager.js';
import { gridfs } from '../vfs/gridfs.js';
import type { ChatMessage, ChatSession } from '../shared/types.js';
import { ValidationError, NotFoundError } from '../shared/errors.js';

const db = new SQLDatabase('ai', {
  migrations: './migrations',
});

export interface ChatContext {
  codeFiles?: Array<{ path: string; content: string }>;
  gitHistory?: Array<{ hash: string; message: string }>;
  uiComponents?: Array<{ name: string; path: string; code: string }>;
  relevantEmbeddings?: Array<{ content: string; score: number }>;
}

export interface StreamChunk {
  type: 'token' | 'done' | 'error' | 'context';
  content?: string;
  context?: ChatContext;
  messageId?: string;
  error?: string;
}

export class ChatManager {
  private openai: OpenAI;
  private readonly model = 'gpt-4-turbo-preview';

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey || !apiKey.startsWith('sk-')) {
      console.warn('[AI Service] OPENAI_API_KEY not set or invalid, AI features will be disabled');
      // Create stub OpenAI client for development
      this.openai = {} as OpenAI;
    } else {
      this.openai = new OpenAI({ apiKey });
    }
  }

  /**
   * Create a new chat session
   */
  async createSession(projectId: bigint, userId: string, title?: string): Promise<ChatSession> {
    const session = await db.queryRow<ChatSession>`
      INSERT INTO chat_sessions (project_id, user_id, title)
      VALUES (${projectId}, ${userId}, ${title || 'New Chat'})
      RETURNING *
    `;

    if (!session) {
      throw new Error('Failed to create chat session');
    }

    console.log(`✓ Created chat session ${session.id} for project ${projectId}`);

    return session;
  }

  /**
   * Get chat session by ID
   */
  async getSession(sessionId: bigint): Promise<ChatSession> {
    const session = await db.queryRow<ChatSession>`
      SELECT * FROM chat_sessions
      WHERE id = ${sessionId}
      AND deleted_at IS NULL
    `;

    if (!session) {
      throw new NotFoundError(`Chat session not found: ${sessionId}`);
    }

    return session;
  }

  /**
   * List chat sessions for a project
   */
  async listSessions(projectId: bigint, userId: string, limit: number = 50): Promise<ChatSession[]> {
    const sessions: ChatSession[] = [];

    for await (const session of db.query<ChatSession>`
      SELECT * FROM chat_sessions
      WHERE project_id = ${projectId}
      AND user_id = ${userId}
      AND deleted_at IS NULL
      ORDER BY updated_at DESC
      LIMIT ${limit}
    `) {
      sessions.push(session);
    }

    return sessions;
  }

  /**
   * Delete a chat session (soft delete)
   */
  async deleteSession(sessionId: bigint): Promise<void> {
    await db.exec`
      UPDATE chat_sessions
      SET deleted_at = NOW()
      WHERE id = ${sessionId}
    `;

    console.log(`✓ Deleted chat session ${sessionId}`);
  }

  /**
   * Add a message to a chat session
   */
  async addMessage(
    sessionId: bigint,
    role: 'user' | 'assistant' | 'system',
    content: string,
    metadata?: Record<string, any>
  ): Promise<ChatMessage> {
    const message = await db.queryRow<ChatMessage>`
      INSERT INTO chat_messages (session_id, role, content, metadata)
      VALUES (${sessionId}, ${role}, ${content}, ${metadata ? JSON.stringify(metadata) : null})
      RETURNING *
    `;

    if (!message) {
      throw new Error('Failed to add message');
    }

    // Update session timestamp
    await db.exec`
      UPDATE chat_sessions
      SET updated_at = NOW()
      WHERE id = ${sessionId}
    `;

    return message;
  }

  /**
   * Get messages for a session
   */
  async getMessages(sessionId: bigint, limit: number = 100): Promise<ChatMessage[]> {
    const messages: ChatMessage[] = [];

    for await (const message of db.query<ChatMessage>`
      SELECT * FROM chat_messages
      WHERE session_id = ${sessionId}
      ORDER BY created_at ASC
      LIMIT ${limit}
    `) {
      messages.push(message);
    }

    return messages;
  }

  /**
   * Gather RAG context for a user query
   */
  async gatherContext(projectId: bigint, query: string): Promise<ChatContext> {
    const context: ChatContext = {};

    try {
      // Search for relevant code using vector embeddings
      const codeResults = await qdrantManager.search(
        projectId,
        'code',
        query,
        5, // limit
        0.7 // score threshold
      );

      if (codeResults.length > 0) {
        context.relevantEmbeddings = codeResults.map(r => ({
          content: r.content,
          score: r.score,
        }));

        // Get full file contents for top results
        const topFiles = codeResults.slice(0, 3);
        context.codeFiles = [];

        for (const result of topFiles) {
          if (result.metadata.sourcePath) {
            try {
              const content = await gridfs.readFile(projectId, result.metadata.sourcePath);
              context.codeFiles.push({
                path: result.metadata.sourcePath,
                content: content.toString('utf-8'),
              });
            } catch (error) {
              console.warn(`Could not read file ${result.metadata.sourcePath}:`, error);
            }
          }
        }
      }
    } catch (error) {
      console.warn('Error gathering RAG context:', error);
    }

    return context;
  }

  /**
   * Stream chat completion with RAG context
   */
  async *streamChat(
    sessionId: bigint,
    projectId: bigint,
    userMessage: string,
    context?: ChatContext
  ): AsyncGenerator<StreamChunk> {
    // Validate session
    const session = await this.getSession(sessionId);

    // Save user message
    await this.addMessage(sessionId, 'user', userMessage);

    // Gather context if not provided
    if (!context) {
      context = await this.gatherContext(projectId, userMessage);
    }

    // Send context to client
    yield {
      type: 'context',
      context,
    };

    // Get conversation history
    const history = await this.getMessages(sessionId);

    // Build system prompt with context
    const systemPrompt = this.buildSystemPrompt(context);

    // Prepare messages for OpenAI
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-10).map(msg => ({
        role: msg.role as 'user' | 'assistant' | 'system',
        content: msg.content,
      })),
    ];

    try {
      // Stream completion from OpenAI
      const stream = await this.openai.chat.completions.create({
        model: this.model,
        messages,
        stream: true,
        temperature: 0.7,
        max_tokens: 2000,
      });

      let fullResponse = '';

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;

        if (content) {
          fullResponse += content;
          yield {
            type: 'token',
            content,
          };
        }
      }

      // Save assistant response
      const assistantMessage = await this.addMessage(sessionId, 'assistant', fullResponse, {
        context,
        model: this.model,
      });

      // Index the conversation in vector store
      await this.indexConversation(projectId, userMessage, fullResponse);

      yield {
        type: 'done',
        messageId: assistantMessage.id.toString(),
      };
    } catch (error) {
      console.error('Error streaming chat:', error);
      yield {
        type: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Build system prompt with RAG context
   */
  private buildSystemPrompt(context: ChatContext): string {
    let prompt = `You are KiloCode, an expert AI coding assistant integrated into the Vaporform development environment.

Your capabilities:
- Generate, modify, and explain code
- Help debug issues and suggest improvements
- Work with the project's virtual file system
- Understand Git history and code changes
- Provide architectural guidance

Important guidelines:
- Be concise and actionable
- Provide complete, working code examples
- Consider the existing codebase context
- Suggest best practices and patterns
- Ask clarifying questions when needed
`;

    // Add relevant code context
    if (context.codeFiles && context.codeFiles.length > 0) {
      prompt += '\n\nRelevant code files in this project:\n\n';
      for (const file of context.codeFiles) {
        prompt += `File: ${file.path}\n\`\`\`\n${file.content.slice(0, 2000)}\n\`\`\`\n\n`;
      }
    }

    // Add UI component context
    if (context.uiComponents && context.uiComponents.length > 0) {
      prompt += '\n\nSelected UI components:\n\n';
      for (const component of context.uiComponents) {
        prompt += `Component: ${component.name} (${component.path})\n\`\`\`\n${component.code}\n\`\`\`\n\n`;
      }
    }

    // Add Git history context
    if (context.gitHistory && context.gitHistory.length > 0) {
      prompt += '\n\nRecent Git commits:\n';
      for (const commit of context.gitHistory) {
        prompt += `- ${commit.hash.slice(0, 7)}: ${commit.message}\n`;
      }
      prompt += '\n';
    }

    return prompt;
  }

  /**
   * Index conversation in vector store for future RAG
   */
  private async indexConversation(
    projectId: bigint,
    userMessage: string,
    assistantResponse: string
  ): Promise<void> {
    try {
      const conversationText = `User: ${userMessage}\nAssistant: ${assistantResponse}`;

      await qdrantManager.upsertEmbedding(
        projectId,
        'chat',
        conversationText,
        {
          timestamp: new Date().toISOString(),
        }
      );
    } catch (error) {
      console.warn('Failed to index conversation:', error);
    }
  }

  /**
   * Extract UI component information for UI Edit Mode
   */
  async extractUIComponent(
    projectId: bigint,
    filePath: string,
    selector: string,
    componentName?: string
  ): Promise<any> {
    try {
      // Read the file
      const content = await gridfs.readFile(projectId, filePath);
      const code = content.toString('utf-8');

      // Simple extraction - in production, use AST parsing
      const lines = code.split('\n');

      // For now, return basic info
      // TODO: Implement proper AST parsing with babel/typescript
      const component = await db.queryRow`
        INSERT INTO ui_components (
          project_id,
          file_path,
          component_name,
          selector,
          code_snippet
        ) VALUES (
          ${projectId},
          ${filePath},
          ${componentName || 'Unknown'},
          ${selector},
          ${code.slice(0, 1000)}
        )
        RETURNING *
      `;

      return component;
    } catch (error) {
      console.error('Error extracting UI component:', error);
      throw error;
    }
  }

  /**
   * Generate code modification based on AI suggestion
   */
  async applyCodeChange(
    projectId: bigint,
    filePath: string,
    aiSuggestion: string
  ): Promise<{ success: boolean; newContent?: string }> {
    try {
      // Read current file
      const currentContent = await gridfs.readFile(projectId, filePath);
      const currentCode = currentContent.toString('utf-8');

      // Use AI to generate the modified code
      const prompt = `Given the following code file and modification request, generate the complete modified file.

File: ${filePath}

Current code:
\`\`\`
${currentCode}
\`\`\`

Modification request:
${aiSuggestion}

Respond with ONLY the complete modified code, no explanations.`;

      const completion = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: 'You are a code modification assistant. Output only code, no explanations.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
      });

      const newContent = completion.choices[0]?.message?.content;

      if (!newContent) {
        return { success: false };
      }

      // Write modified file
      await gridfs.writeFile(projectId, filePath, newContent, 'text/plain');

      console.log(`✓ Applied AI code change to ${filePath}`);

      return { success: true, newContent };
    } catch (error) {
      console.error('Error applying code change:', error);
      return { success: false };
    }
  }
}

// Singleton instance
export const chatManager = new ChatManager();
