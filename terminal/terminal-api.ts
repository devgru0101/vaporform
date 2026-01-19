/**
 * Terminal API endpoints
 * Provides WebSocket terminal access with RBAC
 */

import { api, Header } from 'encore.dev/api';
import { verifyClerkJWT } from '../shared/clerk-auth.js';
import { ensureProjectPermission } from '../projects/permissions.js';
import { terminalManager } from './terminal-manager.js';
import { ValidationError, toAPIError } from '../shared/errors.js';
import { validateProjectId, validateWorkspaceId, validateSessionId } from '../shared/validation.js';

interface CreateSessionRequest {
  authorization: Header<'Authorization'>;
  projectId: string;
  workspaceId?: string;
  shell?: string;
  cwd?: string;
  cols?: number;
  rows?: number;
}

interface GetSessionRequest {
  authorization: Header<'Authorization'>;
  sessionId: string;
}

interface ListSessionsRequest {
  authorization: Header<'Authorization'>;
  projectId?: string;
}

interface CloseSessionRequest {
  authorization: Header<'Authorization'>;
  sessionId: string;
}

interface GetHistoryRequest {
  authorization: Header<'Authorization'>;
  sessionId: string;
  limit?: number;
}

/**
 * Create a new terminal session
 */
export const createSession = api(
  { method: 'POST', path: '/terminal/sessions' },
  async (req: CreateSessionRequest): Promise<{ session: any }> => {
    const { userId } = await verifyClerkJWT(req.authorization);

    // Validate IDs with proper error handling
    const projectId = validateProjectId(req.projectId);
    await ensureProjectPermission(userId, projectId, 'edit');

    const workspaceId = req.workspaceId ? validateWorkspaceId(req.workspaceId) : undefined;

    const session = await terminalManager.createSession(
      projectId,
      userId,
      workspaceId,
      req.shell,
      req.cwd,
      req.cols,
      req.rows
    );

    return { session };
  }
);

/**
 * Get terminal session by ID
 */
export const getSession = api(
  { method: 'GET', path: '/terminal/sessions/:sessionId' },
  async (req: GetSessionRequest): Promise<{ session: any }> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const sessionId = validateSessionId(req.sessionId);

    const session = await terminalManager.getSession(sessionId);

    // Verify user owns this session
    if (session.user_id !== userId) {
      throw toAPIError(new ValidationError('Not authorized to access this session'));
    }

    return { session };
  }
);

/**
 * List terminal sessions
 */
export const listSessions = api(
  { method: 'GET', path: '/terminal/sessions' },
  async (req: ListSessionsRequest): Promise<{ sessions: any[] }> => {
    const { userId } = await verifyClerkJWT(req.authorization);

    const projectId = req.projectId ? validateProjectId(req.projectId) : undefined;

    if (projectId) {
      await ensureProjectPermission(userId, projectId, 'view');
    }

    const sessions = await terminalManager.listSessions(userId, projectId);

    return { sessions };
  }
);

/**
 * Close a terminal session
 */
export const closeSession = api(
  { method: 'POST', path: '/terminal/sessions/:sessionId/close' },
  async (req: CloseSessionRequest): Promise<{ success: boolean }> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const sessionId = validateSessionId(req.sessionId);

    const session = await terminalManager.getSession(sessionId);

    // Verify user owns this session
    if (session.user_id !== userId) {
      throw toAPIError(new ValidationError('Not authorized to close this session'));
    }

    await terminalManager.closeSession(sessionId);

    return { success: true };
  }
);

/**
 * Get command history for a session
 */
export const getHistory = api(
  { method: 'GET', path: '/terminal/sessions/:sessionId/history' },
  async (req: GetHistoryRequest): Promise<{ history: any[] }> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const sessionId = BigInt(req.sessionId);

    const session = await terminalManager.getSession(sessionId);

    // Verify user owns this session
    if (session.user_id !== userId) {
      throw toAPIError(new ValidationError('Not authorized to access this session'));
    }

    const history = await terminalManager.getHistory(sessionId, req.limit || 100);

    return { history };
  }
);

/**
 * WebSocket endpoint for terminal connections
 *
 * This should be handled separately from Encore's HTTP API
 * In production, set up a WebSocket server on a different port
 */

// PTY-based terminal server removed - now using SSH-based terminals via workspace service
// The SSH WebSocket proxy runs on port 4003 in workspace/workspace-api.ts
