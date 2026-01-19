/**
 * Terminal Manager
 * Manages WebSocket-based terminal sessions with PTY
 * Supports both local PTY and remote Daytona sandbox PTY
 */

import * as pty from 'node-pty';
import { SQLDatabase } from 'encore.dev/storage/sqldb';
import { NotFoundError } from '../shared/errors.js';
import type { WebSocket } from 'ws';
import type { PtyHandle } from '@daytonaio/sdk';

const db = new SQLDatabase('terminal', {
  migrations: './migrations',
});

interface TerminalSession {
  id: bigint;
  project_id: bigint;
  workspace_id?: bigint;
  user_id: string;
  status: 'active' | 'closed';
  shell: string;
  cwd: string;
  pid?: number;
  cols: number;
  rows: number;
  created_at: Date;
  closed_at?: Date;
}

interface PTYProcess {
  pty: pty.IPty | null;  // Local PTY (null for Daytona)
  daytonaPty: PtyHandle | null;  // Daytona PTY (null for local)
  ws: WebSocket;
  sessionId: bigint;
  isDaytona: boolean;  // Flag to indicate which PTY type is being used
}

export class TerminalManager {
  private activeSessions: Map<string, PTYProcess> = new Map();

  /**
   * Create a new terminal session
   */
  async createSession(
    projectId: bigint,
    userId: string,
    workspaceId?: bigint,
    shell?: string,
    cwd?: string,
    cols?: number,
    rows?: number
  ): Promise<TerminalSession> {
    const session = await db.queryRow<TerminalSession>`
      INSERT INTO terminal_sessions (
        project_id,
        workspace_id,
        user_id,
        shell,
        cwd,
        cols,
        rows
      ) VALUES (
        ${projectId},
        ${workspaceId || null},
        ${userId},
        ${shell || '/bin/sh'},
        ${cwd || '/workspace'},
        ${cols || 80},
        ${rows || 24}
      )
      RETURNING *
    `;

    if (!session) {
      throw new Error('Failed to create terminal session');
    }

    console.log(`✓ Created terminal session ${session.id} for user ${userId}`);

    return session;
  }

  /**
   * Get terminal session by ID
   */
  async getSession(sessionId: bigint): Promise<TerminalSession> {
    const session = await db.queryRow<TerminalSession>`
      SELECT * FROM terminal_sessions
      WHERE id = ${sessionId}
    `;

    if (!session) {
      throw new NotFoundError(`Terminal session not found: ${sessionId}`);
    }

    return session;
  }

  /**
   * List terminal sessions for a user
   */
  async listSessions(userId: string, projectId?: bigint): Promise<TerminalSession[]> {
    const sessions: TerminalSession[] = [];

    if (projectId) {
      for await (const session of db.query<TerminalSession>`
        SELECT * FROM terminal_sessions
        WHERE user_id = ${userId}
        AND project_id = ${projectId}
        ORDER BY created_at DESC
        LIMIT 50
      `) {
        sessions.push(session);
      }
    } else {
      for await (const session of db.query<TerminalSession>`
        SELECT * FROM terminal_sessions
        WHERE user_id = ${userId}
        ORDER BY created_at DESC
        LIMIT 50
      `) {
        sessions.push(session);
      }
    }

    return sessions;
  }

  /**
   * Start PTY process for a terminal session
   * Automatically uses Daytona PTY if workspace has a sandbox, otherwise uses local PTY
   */
  async startPTY(sessionId: bigint, ws: WebSocket): Promise<void> {
    const session = await this.getSession(sessionId);

    // Check if this session should use Daytona PTY
    if (session.workspace_id) {
      try {
        const { daytonaManager } = await import('../workspace/daytona-manager.js');
        const workspace = await daytonaManager.getWorkspace(session.workspace_id);

        // If workspace has a Daytona sandbox, use Daytona PTY
        if (workspace.daytona_sandbox_id && workspace.status === 'running') {
          await this.startDaytonaPTY(sessionId, ws, workspace.daytona_sandbox_id, session);
          return;
        }
      } catch (error) {
        console.warn(`Could not get Daytona workspace for session ${sessionId}, falling back to local PTY:`, error);
      }
    }

    // Fall back to local PTY
    await this.startLocalPTY(sessionId, ws, session);
  }

  /**
   * Start local PTY process (original implementation)
   */
  private async startLocalPTY(sessionId: bigint, ws: WebSocket, session: TerminalSession): Promise<void> {
    // Import validation utilities for shell whitelisting and safe env
    const { validateShell, getSafeEnvForPty } = await import('../shared/validation.js');

    // Determine shell based on platform with validation
    let shell: string;
    if (process.platform === 'win32') {
      shell = 'powershell.exe';
    } else {
      // Validate shell is in allowlist to prevent shell injection
      try {
        shell = validateShell(session.shell);
      } catch (error) {
        console.warn(`[Terminal] Invalid shell "${session.shell}", falling back to /bin/sh`);
        shell = '/bin/sh';
      }
    }

    // SECURITY: Only pass safe environment variables to PTY
    // This prevents leaking API keys, secrets, and other sensitive data
    const safeEnv = getSafeEnvForPty();

    // Spawn PTY process with safe environment
    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: session.cols,
      rows: session.rows,
      cwd: session.cwd,
      env: safeEnv,
    });

    // Update session with PID
    await db.exec`
      UPDATE terminal_sessions
      SET pid = ${ptyProcess.pid}
      WHERE id = ${sessionId}
    `;

    // Store active session
    const key = sessionId.toString();
    this.activeSessions.set(key, {
      pty: ptyProcess,
      daytonaPty: null,
      ws,
      sessionId,
      isDaytona: false,
    });

    // Forward PTY output to WebSocket
    ptyProcess.onData((data) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({
          type: 'output',
          data,
        }));
      }
    });

    // Handle PTY exit
    ptyProcess.onExit(({ exitCode }) => {
      console.log(`Local PTY process exited with code ${exitCode} for session ${sessionId}`);

      this.closeSession(sessionId).catch(err => {
        console.error(`Failed to close session ${sessionId}:`, err);
      });

      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({
          type: 'exit',
          exitCode,
        }));
        ws.close();
      }
    });

    console.log(`✓ Started local PTY for session ${sessionId} (PID: ${ptyProcess.pid})`);
  }

  /**
   * Start Daytona PTY process (connects to Daytona sandbox)
   */
  private async startDaytonaPTY(sessionId: bigint, ws: WebSocket, sandboxId: string, session: TerminalSession): Promise<void> {
    const { daytonaManager } = await import('../workspace/daytona-manager.js');
    const workspace = await daytonaManager.getWorkspace(session.workspace_id!);
    const { daytona } = daytonaManager as any;

    if (!daytona) {
      throw new Error('Daytona SDK not initialized');
    }

    // Get sandbox instance
    const sandbox = await daytona.get(sandboxId);

    // Create PTY session in Daytona sandbox
    const ptyHandle = await sandbox.process.createPty({
      id: `vaporform-terminal-${sessionId}`,
      cwd: session.cwd,
      cols: session.cols,
      rows: session.rows,
      onData: (data: Uint8Array) => {
        // Forward Daytona PTY output to WebSocket
        if (ws.readyState === ws.OPEN) {
          const text = new TextDecoder().decode(data);
          ws.send(JSON.stringify({
            type: 'output',
            data: text,
          }));
        }
      },
    });

    // Wait for connection to be established
    await ptyHandle.waitForConnection();

    // Store active session
    const key = sessionId.toString();
    this.activeSessions.set(key, {
      pty: null,
      daytonaPty: ptyHandle,
      ws,
      sessionId,
      isDaytona: true,
    });

    // Handle PTY completion in background
    ptyHandle.wait().then((result: any) => {
      console.log(`Daytona PTY exited with code ${result.exitCode} for session ${sessionId}`);

      this.closeSession(sessionId).catch((err: any) => {
        console.error(`Failed to close session ${sessionId}:`, err);
      });

      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({
          type: 'exit',
          exitCode: result.exitCode || 0,
        }));
        ws.close();
      }
    }).catch((err: any) => {
      console.error(`Daytona PTY error for session ${sessionId}:`, err);
    });

    console.log(`✓ Started Daytona PTY for session ${sessionId} (Sandbox: ${sandboxId})`);
  }

  /**
   * Write input to PTY
   */
  writeInput(sessionId: bigint, data: string): void {
    const key = sessionId.toString();
    const session = this.activeSessions.get(key);

    if (!session) {
      throw new Error(`No active PTY for session ${sessionId}`);
    }

    // Handle both local and Daytona PTY
    if (session.isDaytona && session.daytonaPty) {
      session.daytonaPty.sendInput(new TextEncoder().encode(data));
    } else if (session.pty) {
      session.pty.write(data);
    } else {
      throw new Error(`No valid PTY instance for session ${sessionId}`);
    }
  }

  /**
   * Resize PTY
   */
  async resize(sessionId: bigint, cols: number, rows: number): Promise<void> {
    const key = sessionId.toString();
    const session = this.activeSessions.get(key);

    if (!session) {
      console.warn(`Resize requested for inactive session ${sessionId}`);
      return; // Silently ignore instead of throwing
    }

    try {
      // Handle both local and Daytona PTY
      if (session.isDaytona && session.daytonaPty) {
        await session.daytonaPty.resize(cols, rows);
        console.log(`✓ Resized Daytona PTY for session ${sessionId} to ${cols}x${rows}`);
      } else if (session.pty) {
        session.pty.resize(cols, rows);
        console.log(`✓ Resized local PTY for session ${sessionId} to ${cols}x${rows}`);
      } else {
        console.warn(`No valid PTY instance for session ${sessionId}`);
        return;
      }

      // Update session
      await db.exec`
        UPDATE terminal_sessions
        SET cols = ${cols}, rows = ${rows}
        WHERE id = ${sessionId}
      `;
    } catch (error) {
      // Log but don't throw - PTY might not be ready yet
      console.warn(`Resize failed for session ${sessionId}:`, error);
    }
  }

  /**
   * Save command to history
   */
  async saveCommand(sessionId: bigint, command: string): Promise<void> {
    // Only save if command is not empty and not just whitespace
    const trimmed = command.trim();
    if (!trimmed) return;

    // Don't save commands that start with space (common convention for private commands)
    if (command.startsWith(' ')) return;

    await db.exec`
      INSERT INTO terminal_history (session_id, command)
      VALUES (${sessionId}, ${trimmed})
    `;
  }

  /**
   * Get command history for a session
   */
  async getHistory(sessionId: bigint, limit: number = 100): Promise<Array<{
    id: bigint;
    command: string;
    executed_at: Date;
  }>> {
    const history: Array<{
      id: bigint;
      command: string;
      executed_at: Date;
    }> = [];

    for await (const item of db.query<{
      id: bigint;
      command: string;
      executed_at: Date;
    }>`
      SELECT id, command, executed_at
      FROM terminal_history
      WHERE session_id = ${sessionId}
      ORDER BY executed_at DESC
      LIMIT ${limit}
    `) {
      history.push(item);
    }

    return history.reverse(); // Return in chronological order
  }

  /**
   * Close a terminal session
   */
  async closeSession(sessionId: bigint): Promise<void> {
    const key = sessionId.toString();
    const session = this.activeSessions.get(key);

    if (session) {
      // Kill PTY process - handle both local and Daytona
      try {
        if (session.isDaytona && session.daytonaPty) {
          await session.daytonaPty.disconnect();
        } else if (session.pty) {
          session.pty.kill();
        }
      } catch (error) {
        console.warn(`Could not kill PTY for session ${sessionId}:`, error);
      }

      // Close WebSocket
      if (session.ws.readyState === session.ws.OPEN) {
        session.ws.close();
      }

      // Remove from active sessions
      this.activeSessions.delete(key);
    }

    // Update database
    await db.exec`
      UPDATE terminal_sessions
      SET status = 'closed', closed_at = NOW()
      WHERE id = ${sessionId}
    `;

    console.log(`✓ Closed terminal session ${sessionId}`);
  }

  /**
   * Get active session for WebSocket
   */
  getActiveSession(sessionId: bigint): PTYProcess | undefined {
    const key = sessionId.toString();
    return this.activeSessions.get(key);
  }

  /**
   * Clean up all sessions (called on shutdown)
   */
  async cleanup(): Promise<void> {
    console.log(`Cleaning up ${this.activeSessions.size} active terminal sessions...`);

    for (const [key, session] of this.activeSessions.entries()) {
      try {
        // Handle both local and Daytona PTY
        if (session.isDaytona && session.daytonaPty) {
          await session.daytonaPty.disconnect();
        } else if (session.pty) {
          session.pty.kill();
        }

        if (session.ws.readyState === session.ws.OPEN) {
          session.ws.close();
        }
      } catch (error) {
        console.warn(`Error cleaning up session ${key}:`, error);
      }
    }

    this.activeSessions.clear();
  }
}

// Singleton instance
export const terminalManager = new TerminalManager();

// Cleanup on process exit
process.on('SIGINT', async () => {
  await terminalManager.cleanup();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await terminalManager.cleanup();
  process.exit(0);
});
