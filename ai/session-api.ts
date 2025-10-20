/**
 * Unified Session Management API
 * Handles session creation, retrieval, and management for all agent types
 */

import { api, Header } from 'encore.dev/api';
import { verifyClerkJWT } from '../shared/clerk-auth.js';
import { ensureProjectPermission } from '../projects/permissions.js';
import { ValidationError, toAPIError } from '../shared/errors.js';
import { db } from './db.js';

interface CreateSessionRequest {
  authorization: Header<'Authorization'>;
  projectId: string;
  sessionType?: 'code' | 'terminal' | 'hybrid';
  title?: string;
}

interface CreateSessionResponse {
  session: {
    id: string;
    projectId: string;
    userId: string;
    sessionType: string;
    title: string | null;
    status: string;
    createdAt: Date;
  };
}

interface ListSessionsRequest {
  authorization: Header<'Authorization'>;
  projectId: string;
}

interface ListSessionsResponse {
  sessions: Array<{
    id: string;
    projectId: string;
    userId: string;
    sessionType: string;
    title: string | null;
    status: string;
    lastActivityAt: Date;
    createdAt: Date;
  }>;
}

interface GetSessionRequest {
  authorization: Header<'Authorization'>;
  sessionId: string;
}

interface GetSessionResponse {
  session: {
    id: string;
    projectId: string;
    userId: string;
    sessionType: string;
    title: string | null;
    status: string;
    sharedContext: Record<string, any>;
    metadata: Record<string, any>;
    lastActivityAt: Date;
    createdAt: Date;
  };
}

interface AddMessageRequest {
  authorization: Header<'Authorization'>;
  sessionId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  agentType?: 'code' | 'terminal' | 'system';
  metadata?: Record<string, any>;
}

interface AddMessageResponse {
  message: {
    id: string;
    sessionId: string;
    role: string;
    content: string;
    agentType: string | null;
    createdAt: Date;
  };
}

interface GetMessagesRequest {
  authorization: Header<'Authorization'>;
  sessionId: string;
  limit?: string;
}

interface GetMessagesResponse {
  messages: Array<{
    id: string;
    sessionId: string;
    role: string;
    content: string;
    agentType: string | null;
    toolName: string | null;
    toolInput: Record<string, any> | null;
    toolOutput: Record<string, any> | null;
    toolStatus: string | null;
    metadata: Record<string, any>;
    createdAt: Date;
  }>;
}

/**
 * Create a new agent session
 */
export const createSession = api(
  { method: 'POST', path: '/ai/sessions' },
  async (req: CreateSessionRequest): Promise<CreateSessionResponse> => {
    try {
      const { userId } = await verifyClerkJWT(req.authorization);
      const projectId = BigInt(req.projectId);

      await ensureProjectPermission(userId, projectId, 'view');

      const sessionType = req.sessionType || 'code';
      const title = req.title || `${sessionType} session`;

      const session = await db.queryRow<{
        id: bigint;
        project_id: bigint;
        user_id: string;
        session_type: string;
        title: string | null;
        status: string;
        created_at: Date;
      }>`
        INSERT INTO agent_sessions (
          project_id, user_id, session_type, title, status, shared_context, metadata
        )
        VALUES (
          ${projectId}, ${userId}, ${sessionType}, ${title}, 'active', '{}', '{}'
        )
        RETURNING id, project_id, user_id, session_type, title, status, created_at
      `;

      if (!session) {
        throw new Error('Failed to create session');
      }

      return {
        session: {
          id: session.id.toString(),
          projectId: session.project_id.toString(),
          userId: session.user_id,
          sessionType: session.session_type,
          title: session.title,
          status: session.status,
          createdAt: session.created_at,
        },
      };
    } catch (error) {
      console.error('Error creating session:', error);
      const err = error instanceof ValidationError ? error : new ValidationError(
        error instanceof Error ? error.message : 'Failed to create session'
      );
      throw toAPIError(err);
    }
  }
);

/**
 * List sessions for a project
 */
export const listSessions = api(
  { method: 'GET', path: '/ai/projects/:projectId/sessions' },
  async (req: ListSessionsRequest): Promise<ListSessionsResponse> => {
    try {
      const { userId } = await verifyClerkJWT(req.authorization);
      const projectId = BigInt(req.projectId);

      await ensureProjectPermission(userId, projectId, 'view');

      const sessions: Array<{
        id: string;
        projectId: string;
        userId: string;
        sessionType: string;
        title: string | null;
        status: string;
        lastActivityAt: Date;
        createdAt: Date;
      }> = [];

      for await (const session of db.query<{
        id: bigint;
        project_id: bigint;
        user_id: string;
        session_type: string;
        title: string | null;
        status: string;
        last_activity_at: Date;
        created_at: Date;
      }>`
        SELECT id, project_id, user_id, session_type, title, status, last_activity_at, created_at
        FROM agent_sessions
        WHERE project_id = ${projectId}
          AND user_id = ${userId}
          AND deleted_at IS NULL
        ORDER BY last_activity_at DESC
        LIMIT 100
      `) {
        sessions.push({
          id: session.id.toString(),
          projectId: session.project_id.toString(),
          userId: session.user_id,
          sessionType: session.session_type,
          title: session.title,
          status: session.status,
          lastActivityAt: session.last_activity_at,
          createdAt: session.created_at,
        });
      }

      return { sessions };
    } catch (error) {
      console.error('Error listing sessions:', error);
      const err = error instanceof ValidationError ? error : new ValidationError(
        error instanceof Error ? error.message : 'Failed to list sessions'
      );
      throw toAPIError(err);
    }
  }
);

/**
 * Get a single session by ID
 */
export const getSession = api(
  { method: 'GET', path: '/ai/sessions/:sessionId' },
  async (req: GetSessionRequest): Promise<GetSessionResponse> => {
    try {
      const { userId } = await verifyClerkJWT(req.authorization);
      const sessionId = BigInt(req.sessionId);

      const session = await db.queryRow<{
        id: bigint;
        project_id: bigint;
        user_id: string;
        session_type: string;
        title: string | null;
        status: string;
        shared_context: Record<string, any>;
        metadata: Record<string, any>;
        last_activity_at: Date;
        created_at: Date;
      }>`
        SELECT id, project_id, user_id, session_type, title, status,
               shared_context, metadata, last_activity_at, created_at
        FROM agent_sessions
        WHERE id = ${sessionId}
          AND user_id = ${userId}
          AND deleted_at IS NULL
      `;

      if (!session) {
        throw new ValidationError('Session not found');
      }

      return {
        session: {
          id: session.id.toString(),
          projectId: session.project_id.toString(),
          userId: session.user_id,
          sessionType: session.session_type,
          title: session.title,
          status: session.status,
          sharedContext: session.shared_context,
          metadata: session.metadata,
          lastActivityAt: session.last_activity_at,
          createdAt: session.created_at,
        },
      };
    } catch (error) {
      console.error('Error getting session:', error);
      const err = error instanceof ValidationError ? error : new ValidationError(
        error instanceof Error ? error.message : 'Failed to get session'
      );
      throw toAPIError(err);
    }
  }
);

/**
 * Add a message to a session
 */
export const addMessage = api(
  { method: 'POST', path: '/ai/sessions/:sessionId/messages' },
  async (req: AddMessageRequest): Promise<AddMessageResponse> => {
    try {
      const { userId } = await verifyClerkJWT(req.authorization);
      const sessionId = BigInt(req.sessionId);

      // Verify session ownership
      const session = await db.queryRow<{ user_id: string }>`
        SELECT user_id
        FROM agent_sessions
        WHERE id = ${sessionId}
          AND deleted_at IS NULL
      `;

      if (!session || session.user_id !== userId) {
        throw new ValidationError('Session not found');
      }

      // Add message
      const message = await db.queryRow<{
        id: bigint;
        session_id: bigint;
        role: string;
        content: string;
        agent_type: string | null;
        created_at: Date;
      }>`
        INSERT INTO agent_messages (
          session_id, role, content, agent_type, content_type, metadata
        )
        VALUES (
          ${sessionId}, ${req.role}, ${req.content}, ${req.agentType || null},
          'text', ${req.metadata || {}}
        )
        RETURNING id, session_id, role, content, agent_type, created_at
      `;

      if (!message) {
        throw new Error('Failed to add message');
      }

      // Update session last_activity_at
      await db.exec`
        UPDATE agent_sessions
        SET last_activity_at = NOW(), updated_at = NOW()
        WHERE id = ${sessionId}
      `;

      return {
        message: {
          id: message.id.toString(),
          sessionId: message.session_id.toString(),
          role: message.role,
          content: message.content,
          agentType: message.agent_type,
          createdAt: message.created_at,
        },
      };
    } catch (error) {
      console.error('Error adding message:', error);
      const err = error instanceof ValidationError ? error : new ValidationError(
        error instanceof Error ? error.message : 'Failed to add message'
      );
      throw toAPIError(err);
    }
  }
);

/**
 * Get messages for a session
 */
export const getMessages = api(
  { method: 'GET', path: '/ai/sessions/:sessionId/messages' },
  async (req: GetMessagesRequest): Promise<GetMessagesResponse> => {
    try {
      const { userId } = await verifyClerkJWT(req.authorization);
      const sessionId = BigInt(req.sessionId);
      const limit = req.limit ? parseInt(req.limit) : 100;

      // Verify session ownership
      const session = await db.queryRow<{ user_id: string }>`
        SELECT user_id
        FROM agent_sessions
        WHERE id = ${sessionId}
          AND deleted_at IS NULL
      `;

      if (!session || session.user_id !== userId) {
        throw new ValidationError('Session not found');
      }

      const messages: Array<{
        id: string;
        sessionId: string;
        role: string;
        content: string;
        agentType: string | null;
        toolName: string | null;
        toolInput: Record<string, any> | null;
        toolOutput: Record<string, any> | null;
        toolStatus: string | null;
        metadata: Record<string, any>;
        createdAt: Date;
      }> = [];

      for await (const msg of db.query<{
        id: bigint;
        session_id: bigint;
        role: string;
        content: string;
        agent_type: string | null;
        tool_name: string | null;
        tool_input: Record<string, any> | null;
        tool_output: Record<string, any> | null;
        tool_status: string | null;
        metadata: Record<string, any>;
        created_at: Date;
      }>`
        SELECT id, session_id, role, content, agent_type,
               tool_name, tool_input, tool_output, tool_status,
               metadata, created_at
        FROM agent_messages
        WHERE session_id = ${sessionId}
        ORDER BY created_at ASC
        LIMIT ${limit}
      `) {
        messages.push({
          id: msg.id.toString(),
          sessionId: msg.session_id.toString(),
          role: msg.role,
          content: msg.content,
          agentType: msg.agent_type,
          toolName: msg.tool_name,
          toolInput: msg.tool_input,
          toolOutput: msg.tool_output,
          toolStatus: msg.tool_status,
          metadata: msg.metadata,
          createdAt: msg.created_at,
        });
      }

      return { messages };
    } catch (error) {
      console.error('Error getting messages:', error);
      const err = error instanceof ValidationError ? error : new ValidationError(
        error instanceof Error ? error.message : 'Failed to get messages'
      );
      throw toAPIError(err);
    }
  }
);
