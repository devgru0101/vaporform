/**
 * Terminal API endpoints
 * Provides WebSocket terminal access with RBAC
 */

import { api, Header } from 'encore.dev/api';
import { verifyClerkJWT } from '../shared/clerk-auth.js';
import { ensureProjectPermission } from '../projects/permissions.js';
import { terminalManager } from './terminal-manager.js';
import { WebSocketServer, WebSocket } from 'ws';
import { ValidationError, toAPIError } from '../shared/errors.js';
import { createServer } from 'http';

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
    const projectId = BigInt(req.projectId);

    await ensureProjectPermission(userId, projectId, 'edit');

    const workspaceId = req.workspaceId ? BigInt(req.workspaceId) : undefined;

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
    const sessionId = BigInt(req.sessionId);

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

    const projectId = req.projectId ? BigInt(req.projectId) : undefined;

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
    const sessionId = BigInt(req.sessionId);

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

// Create WebSocket server (runs on port 4001)
const wss = new WebSocketServer({ port: 4001 });

wss.on('connection', async (ws: WebSocket, req) => {
  console.log('WebSocket connection received');

  // Extract session ID and auth token from URL query
  const url = new URL(req.url || '', 'ws://localhost');
  const sessionId = url.searchParams.get('sessionId');
  const token = url.searchParams.get('token');

  if (!sessionId || !token) {
    ws.close(1008, 'Missing sessionId or token');
    return;
  }

  try {
    // Verify authentication
    const { userId } = await verifyClerkJWT(`Bearer ${token}`);

    // Get session and verify ownership
    const session = await terminalManager.getSession(BigInt(sessionId));

    if (session.user_id !== userId) {
      ws.close(1008, 'Not authorized');
      return;
    }

    // Start PTY
    await terminalManager.startPTY(BigInt(sessionId), ws);

    // Handle incoming messages
    ws.on('message', async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());

        switch (message.type) {
          case 'input':
            terminalManager.writeInput(BigInt(sessionId), message.data);

            // Check if it's a command (ends with newline)
            if (message.data.includes('\r') || message.data.includes('\n')) {
              // Extract command from recent input
              // In production, maintain a buffer of recent input
              const command = message.command || message.data.trim();
              if (command) {
                await terminalManager.saveCommand(BigInt(sessionId), command);
              }
            }
            break;

          case 'resize':
            await terminalManager.resize(
              BigInt(sessionId),
              message.cols || 80,
              message.rows || 24
            );
            break;

          default:
            console.warn(`Unknown message type: ${message.type}`);
        }
      } catch (error) {
        console.error('Error handling WebSocket message:', error);
      }
    });

    // Handle disconnection
    ws.on('close', () => {
      console.log(`WebSocket closed for session ${sessionId}`);
      terminalManager.closeSession(BigInt(sessionId)).catch(err => {
        console.error(`Error closing session ${sessionId}:`, err);
      });
    });

    ws.on('error', (error) => {
      console.error(`WebSocket error for session ${sessionId}:`, error);
    });

  } catch (error) {
    console.error('Error setting up terminal session:', error);
    ws.close(1011, 'Internal server error');
  }
});

console.log('✓ WebSocket terminal server listening on port 4001');

// Export for cleanup
export { wss };
