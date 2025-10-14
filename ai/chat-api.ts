/**
 * KiloCode AI Chat API
 * Provides streaming chat interface with RAG
 */

import { api, Header } from 'encore.dev/api';
import { verifyClerkJWT } from '../shared/clerk-auth.js';
import { ensureProjectPermission } from '../projects/permissions.js';
import { chatManager, type ChatContext, type StreamChunk } from './chat-manager.js';
import type { ChatSession, ChatMessage } from '../shared/types.js';
import { ValidationError, toAPIError } from '../shared/errors.js';

interface CreateSessionRequest {
  authorization: Header<'Authorization'>;
  projectId: string;
  title?: string;
}

interface CreateSessionResponse {
  session: ChatSession;
}

interface ListSessionsRequest {
  authorization: Header<'Authorization'>;
  projectId: string;
  limit?: number;
}

interface ListSessionsResponse {
  sessions: ChatSession[];
}

interface GetMessagesRequest {
  authorization: Header<'Authorization'>;
  sessionId: string;
  limit?: number;
}

interface GetMessagesResponse {
  messages: ChatMessage[];
}

interface SendMessageRequest {
  authorization: Header<'Authorization'>;
  sessionId: string;
  message: string;
  context?: ChatContext;
}

interface DeleteSessionRequest {
  authorization: Header<'Authorization'>;
  sessionId: string;
}

interface AddMessageRequest {
  authorization: Header<'Authorization'>;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: Record<string, any>;
}

interface AddMessageResponse {
  message: ChatMessage;
}

interface ExtractUIComponentRequest {
  authorization: Header<'Authorization'>;
  projectId: string;
  filePath: string;
  selector: string;
  componentName?: string;
}

interface ApplyCodeChangeRequest {
  authorization: Header<'Authorization'>;
  projectId: string;
  filePath: string;
  suggestion: string;
}

interface ApplyCodeChangeResponse {
  success: boolean;
  newContent?: string;
}

/**
 * Create a new chat session
 */
export const createSession = api(
  { method: 'POST', path: '/ai/sessions' },
  async (req: CreateSessionRequest): Promise<CreateSessionResponse> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const projectId = BigInt(req.projectId);

    await ensureProjectPermission(userId, projectId, 'view');

    const session = await chatManager.createSession(projectId, userId, req.title);

    return { session };
  }
);

/**
 * List chat sessions for a project
 */
export const listSessions = api(
  { method: 'GET', path: '/ai/projects/:projectId/sessions' },
  async (req: ListSessionsRequest): Promise<ListSessionsResponse> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const projectId = BigInt(req.projectId);

    await ensureProjectPermission(userId, projectId, 'view');

    const sessions = await chatManager.listSessions(projectId, userId, req.limit || 50);

    return { sessions };
  }
);

/**
 * Get messages for a session
 */
export const getMessages = api(
  { method: 'GET', path: '/ai/messages/:sessionId' },
  async (req: GetMessagesRequest): Promise<GetMessagesResponse> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const sessionId = BigInt(req.sessionId);

    // Get session and verify access
    const session = await chatManager.getSession(sessionId);
    await ensureProjectPermission(userId, session.project_id, 'view');

    const messages = await chatManager.getMessages(sessionId, req.limit || 100);

    return { messages };
  }
);

/**
 * Delete a chat session
 */
export const deleteSession = api(
  { method: 'DELETE', path: '/ai/sessions/:sessionId' },
  async (req: DeleteSessionRequest): Promise<{ success: boolean }> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const sessionId = BigInt(req.sessionId);

    // Get session and verify access
    const session = await chatManager.getSession(sessionId);
    await ensureProjectPermission(userId, session.project_id, 'edit');

    await chatManager.deleteSession(sessionId);

    return { success: true };
  }
);

/**
 * Add a message to a chat session
 */
export const addMessage = api(
  { method: 'POST', path: '/ai/sessions/:sessionId/messages' },
  async (req: AddMessageRequest): Promise<AddMessageResponse> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const sessionId = BigInt(req.sessionId);

    // Get session and verify access
    const session = await chatManager.getSession(sessionId);
    await ensureProjectPermission(userId, session.project_id, 'view');

    if (!req.content || req.content.trim().length === 0) {
      throw toAPIError(new ValidationError('Message content is required'));
    }

    const message = await chatManager.addMessage(
      sessionId,
      req.role,
      req.content,
      req.metadata
    );

    return { message };
  }
);

/**
 * Send a message and stream the response
 *
 * This endpoint uses Server-Sent Events (SSE) to stream the AI response
 */
export const sendMessage = api.raw(
  { expose: true, path: '/ai/chat', method: 'POST' },
  async (req, resp) => {
    try {
      // Parse request body
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf-8')) as SendMessageRequest;

      // Verify auth
      const authHeader = req.headers['authorization'];
      if (!authHeader || typeof authHeader !== 'string') {
        resp.writeHead(401, { 'Content-Type': 'application/json' });
        resp.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }

      const { userId } = await verifyClerkJWT(authHeader);
      const sessionId = BigInt(body.sessionId);

      // Verify access
      const session = await chatManager.getSession(sessionId);
      await ensureProjectPermission(userId, session.project_id, 'view');

      // Validate message
      if (!body.message || body.message.trim().length === 0) {
        resp.writeHead(400, { 'Content-Type': 'application/json' });
        resp.end(JSON.stringify({ error: 'Message cannot be empty' }));
        return;
      }

      // Setup SSE
      resp.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });

      // Stream the response
      for await (const chunk of chatManager.streamChat(
        sessionId,
        session.project_id,
        body.message,
        body.context
      )) {
        const data = JSON.stringify(chunk);
        resp.write(`data: ${data}\n\n`);
      }

      resp.end();
    } catch (error) {
      console.error('Error in chat streaming:', error);
      resp.writeHead(500, { 'Content-Type': 'application/json' });
      resp.end(JSON.stringify({
        error: error instanceof Error ? error.message : 'Internal server error',
      }));
    }
  }
);

/**
 * Extract UI component for UI Edit Mode
 */
export const extractUIComponent = api(
  { method: 'POST', path: '/ai/extract-component' },
  async (req: ExtractUIComponentRequest): Promise<{ component: any }> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const projectId = BigInt(req.projectId);

    await ensureProjectPermission(userId, projectId, 'view');

    if (!req.filePath || !req.selector) {
      throw toAPIError(new ValidationError('filePath and selector are required'));
    }

    const component = await chatManager.extractUIComponent(
      projectId,
      req.filePath,
      req.selector,
      req.componentName
    );

    return { component };
  }
);

/**
 * Apply AI-generated code change to a file
 */
export const applyCodeChange = api(
  { method: 'POST', path: '/ai/apply-change' },
  async (req: ApplyCodeChangeRequest): Promise<ApplyCodeChangeResponse> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const projectId = BigInt(req.projectId);

    await ensureProjectPermission(userId, projectId, 'edit');

    if (!req.filePath || !req.suggestion) {
      throw toAPIError(new ValidationError('filePath and suggestion are required'));
    }

    const result = await chatManager.applyCodeChange(
      projectId,
      req.filePath,
      req.suggestion
    );

    return result;
  }
);

/**
 * Generate new file based on AI prompt
 */
export const generateFile = api(
  { method: 'POST', path: '/ai/generate-file' },
  async ({
    authorization,
    projectId,
    filePath,
    prompt,
  }: {
    authorization: Header<'Authorization'>;
    projectId: string;
    filePath: string;
    prompt: string;
  }): Promise<{ success: boolean; content?: string }> => {
    const { userId } = await verifyClerkJWT(authorization);
    const id = BigInt(projectId);

    await ensureProjectPermission(userId, id, 'edit');

    if (!filePath || !prompt) {
      throw toAPIError(new ValidationError('filePath and prompt are required'));
    }

    // For now, delegate to applyCodeChange with empty base
    // In production, this would have specialized logic
    const result = await chatManager.applyCodeChange(id, filePath, prompt);

    return result;
  }
);
