/**
 * Unified Context Manager
 * Manages shared context between code generation and terminal agents
 */

import { createHash } from 'crypto';
import { db } from './db.js';

// ============================================================================
// Types
// ============================================================================

export type SessionType = 'code' | 'terminal' | 'hybrid';
export type SessionStatus = 'active' | 'paused' | 'completed' | 'error';
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';
export type AgentType = 'code' | 'terminal' | 'system';
export type ContentType = 'text' | 'json' | 'markdown' | 'error';
export type ToolStatus = 'pending' | 'running' | 'success' | 'error';
export type ContextItemType = 'file' | 'terminal_output' | 'error' | 'env_var' | 'git_commit' | 'custom';
export type JobType = 'code_generation' | 'terminal_execution' | 'file_operation' | 'git_operation';
export type JobStatus = 'pending' | 'running' | 'completed' | 'error' | 'cancelled';

export interface AgentSession {
  id: bigint;
  project_id: bigint;
  user_id: string;
  session_type: SessionType;
  title: string | null;
  status: SessionStatus;
  context_hash: string | null;
  shared_context: Record<string, any>;
  metadata: Record<string, any>;
  created_at: Date;
  updated_at: Date;
  last_activity_at: Date;
  deleted_at: Date | null;
}

export interface AgentMessage {
  id: bigint;
  session_id: bigint;
  role: MessageRole;
  agent_type: AgentType | null;
  content: string;
  content_type: ContentType;
  tool_name: string | null;
  tool_input: Record<string, any> | null;
  tool_output: Record<string, any> | null;
  tool_status: ToolStatus | null;
  context_snapshot: Record<string, any> | null;
  metadata: Record<string, any>;
  created_at: Date;
}

export interface ContextItem {
  id: bigint;
  project_id: bigint;
  item_type: ContextItemType;
  item_key: string;
  content: string;
  content_hash: string;
  metadata: Record<string, any>;
  last_accessed_at: Date;
  access_count: number;
  created_at: Date;
  updated_at: Date;
}

export interface SessionContextLink {
  id: bigint;
  session_id: bigint;
  context_item_id: bigint;
  relevance_score: number;
  added_at: Date;
}

export interface AgentJob {
  id: bigint;
  session_id: bigint;
  job_type: JobType;
  status: JobStatus;
  description: string | null;
  input_data: Record<string, any> | null;
  output_data: Record<string, any> | null;
  error_message: string | null;
  progress_percentage: number;
  started_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
}

// ============================================================================
// Context Manager Class
// ============================================================================

export class ContextManager {
  /**
   * Create a new agent session
   */
  async createSession(
    projectId: bigint,
    userId: string,
    sessionType: SessionType,
    title?: string,
    metadata?: Record<string, any>
  ): Promise<AgentSession> {
    const session = await db.queryRow<AgentSession>`
      INSERT INTO agent_sessions (project_id, user_id, session_type, title, metadata)
      VALUES (${projectId}, ${userId}, ${sessionType}, ${title || null}, ${metadata || {}})
      RETURNING *
    `;

    if (!session) {
      throw new Error('Failed to create agent session');
    }

    console.log(`[Context Manager] Created ${sessionType} session ${session.id} for project ${projectId}`);
    return session;
  }

  /**
   * Get a session by ID
   */
  async getSession(sessionId: bigint): Promise<AgentSession | null> {
    return await db.queryRow<AgentSession>`
      SELECT * FROM agent_sessions
      WHERE id = ${sessionId} AND deleted_at IS NULL
    `;
  }

  /**
   * Get all active sessions for a project
   */
  async getProjectSessions(
    projectId: bigint,
    sessionType?: SessionType
  ): Promise<AgentSession[]> {
    const sessions: AgentSession[] = [];

    if (sessionType) {
      for await (const session of db.query<AgentSession>`
        SELECT * FROM agent_sessions
        WHERE project_id = ${projectId}
          AND session_type = ${sessionType}
          AND deleted_at IS NULL
        ORDER BY last_activity_at DESC
      `) {
        sessions.push(session);
      }
    } else {
      for await (const session of db.query<AgentSession>`
        SELECT * FROM agent_sessions
        WHERE project_id = ${projectId}
          AND deleted_at IS NULL
        ORDER BY last_activity_at DESC
      `) {
        sessions.push(session);
      }
    }

    return sessions;
  }

  /**
   * Update session status and activity
   */
  async updateSessionActivity(
    sessionId: bigint,
    status?: SessionStatus
  ): Promise<void> {
    if (status) {
      await db.exec`
        UPDATE agent_sessions
        SET last_activity_at = NOW(),
            updated_at = NOW(),
            status = ${status}
        WHERE id = ${sessionId}
      `;
    } else {
      await db.exec`
        UPDATE agent_sessions
        SET last_activity_at = NOW(),
            updated_at = NOW()
        WHERE id = ${sessionId}
      `;
    }
  }

  /**
   * Update session shared context
   */
  async updateSharedContext(
    sessionId: bigint,
    context: Record<string, any>
  ): Promise<void> {
    const contextStr = JSON.stringify(context);
    const contextHash = createHash('sha256').update(contextStr).digest('hex');

    await db.exec`
      UPDATE agent_sessions
      SET shared_context = ${context},
          context_hash = ${contextHash},
          updated_at = NOW()
      WHERE id = ${sessionId}
    `;

    console.log(`[Context Manager] Updated shared context for session ${sessionId} (hash: ${contextHash.substring(0, 8)})`);
  }

  /**
   * Add a message to a session
   */
  async addMessage(
    sessionId: bigint,
    role: MessageRole,
    content: string,
    options?: {
      agentType?: AgentType;
      contentType?: ContentType;
      toolName?: string;
      toolInput?: Record<string, any>;
      toolOutput?: Record<string, any>;
      toolStatus?: ToolStatus;
      contextSnapshot?: Record<string, any>;
      metadata?: Record<string, any>;
    }
  ): Promise<AgentMessage> {
    const message = await db.queryRow<AgentMessage>`
      INSERT INTO agent_messages (
        session_id, role, agent_type, content, content_type,
        tool_name, tool_input, tool_output, tool_status,
        context_snapshot, metadata
      )
      VALUES (
        ${sessionId},
        ${role},
        ${options?.agentType || null},
        ${content},
        ${options?.contentType || 'text'},
        ${options?.toolName || null},
        ${options?.toolInput || null},
        ${options?.toolOutput || null},
        ${options?.toolStatus || null},
        ${options?.contextSnapshot || null},
        ${options?.metadata || {}}
      )
      RETURNING *
    `;

    if (!message) {
      throw new Error('Failed to add message');
    }

    // Update session activity
    await this.updateSessionActivity(sessionId);

    return message;
  }

  /**
   * Get messages for a session
   */
  async getMessages(
    sessionId: bigint,
    limit?: number
  ): Promise<AgentMessage[]> {
    const messages: AgentMessage[] = [];

    if (limit) {
      for await (const message of db.query<AgentMessage>`
        SELECT * FROM agent_messages
        WHERE session_id = ${sessionId}
        ORDER BY created_at ASC
        LIMIT ${limit}
      `) {
        messages.push(message);
      }
    } else {
      for await (const message of db.query<AgentMessage>`
        SELECT * FROM agent_messages
        WHERE session_id = ${sessionId}
        ORDER BY created_at ASC
      `) {
        messages.push(message);
      }
    }

    return messages;
  }

  /**
   * Upsert a context item
   */
  async upsertContextItem(
    projectId: bigint,
    itemType: ContextItemType,
    itemKey: string,
    content: string,
    metadata?: Record<string, any>
  ): Promise<ContextItem> {
    const contentHash = createHash('sha256').update(content).digest('hex');

    const item = await db.queryRow<ContextItem>`
      INSERT INTO context_items (project_id, item_type, item_key, content, content_hash, metadata)
      VALUES (${projectId}, ${itemType}, ${itemKey}, ${content}, ${contentHash}, ${metadata || {}})
      ON CONFLICT (project_id, item_type, item_key)
      DO UPDATE SET
        content = EXCLUDED.content,
        content_hash = EXCLUDED.content_hash,
        metadata = EXCLUDED.metadata,
        updated_at = NOW()
      RETURNING *
    `;

    if (!item) {
      throw new Error('Failed to upsert context item');
    }

    console.log(`[Context Manager] Upserted ${itemType} context item: ${itemKey}`);
    return item;
  }

  /**
   * Get a context item
   */
  async getContextItem(
    projectId: bigint,
    itemType: ContextItemType,
    itemKey: string
  ): Promise<ContextItem | null> {
    const item = await db.queryRow<ContextItem>`
      SELECT * FROM context_items
      WHERE project_id = ${projectId}
        AND item_type = ${itemType}
        AND item_key = ${itemKey}
    `;

    if (item) {
      // Update access tracking
      await db.exec`
        UPDATE context_items
        SET last_accessed_at = NOW(),
            access_count = access_count + 1
        WHERE id = ${item.id}
      `;
    }

    return item;
  }

  /**
   * Link a context item to a session
   */
  async linkContextToSession(
    sessionId: bigint,
    contextItemId: bigint,
    relevanceScore: number = 1.0
  ): Promise<void> {
    await db.exec`
      INSERT INTO session_context_links (session_id, context_item_id, relevance_score)
      VALUES (${sessionId}, ${contextItemId}, ${relevanceScore})
      ON CONFLICT (session_id, context_item_id)
      DO UPDATE SET relevance_score = EXCLUDED.relevance_score
    `;
  }

  /**
   * Get all context items linked to a session
   */
  async getSessionContext(sessionId: bigint): Promise<Array<ContextItem & { relevance_score: number }>> {
    const items: Array<ContextItem & { relevance_score: number }> = [];

    for await (const item of db.query<ContextItem & { relevance_score: number }>`
      SELECT ci.*, scl.relevance_score
      FROM context_items ci
      JOIN session_context_links scl ON scl.context_item_id = ci.id
      WHERE scl.session_id = ${sessionId}
      ORDER BY scl.relevance_score DESC, ci.last_accessed_at DESC
    `) {
      items.push(item);
    }

    return items;
  }

  /**
   * Create an agent job
   */
  async createJob(
    sessionId: bigint,
    jobType: JobType,
    description?: string,
    inputData?: Record<string, any>
  ): Promise<AgentJob> {
    const job = await db.queryRow<AgentJob>`
      INSERT INTO agent_jobs (session_id, job_type, description, input_data, status)
      VALUES (${sessionId}, ${jobType}, ${description || null}, ${inputData || null}, 'pending')
      RETURNING *
    `;

    if (!job) {
      throw new Error('Failed to create job');
    }

    console.log(`[Context Manager] Created ${jobType} job ${job.id} for session ${sessionId}`);
    return job;
  }

  /**
   * Update job status
   */
  async updateJobStatus(
    jobId: bigint,
    status: JobStatus,
    options?: {
      progress?: number;
      outputData?: Record<string, any>;
      errorMessage?: string;
    }
  ): Promise<void> {
    const now = new Date();

    if (status === 'running' && !options) {
      await db.exec`
        UPDATE agent_jobs
        SET status = ${status},
            started_at = COALESCE(started_at, ${now})
        WHERE id = ${jobId}
      `;
    } else if (status === 'completed' || status === 'error' || status === 'cancelled') {
      await db.exec`
        UPDATE agent_jobs
        SET status = ${status},
            progress_percentage = ${options?.progress || 100},
            output_data = ${options?.outputData || null},
            error_message = ${options?.errorMessage || null},
            completed_at = ${now}
        WHERE id = ${jobId}
      `;
    } else {
      await db.exec`
        UPDATE agent_jobs
        SET status = ${status},
            progress_percentage = ${options?.progress || 0},
            output_data = ${options?.outputData || null},
            error_message = ${options?.errorMessage || null}
        WHERE id = ${jobId}
      `;
    }
  }

  /**
   * Get job by ID
   */
  async getJob(jobId: bigint): Promise<AgentJob | null> {
    return await db.queryRow<AgentJob>`
      SELECT * FROM agent_jobs
      WHERE id = ${jobId}
    `;
  }

  /**
   * Get all jobs for a session
   */
  async getSessionJobs(sessionId: bigint): Promise<AgentJob[]> {
    const jobs: AgentJob[] = [];

    for await (const job of db.query<AgentJob>`
      SELECT * FROM agent_jobs
      WHERE session_id = ${sessionId}
      ORDER BY created_at DESC
    `) {
      jobs.push(job);
    }

    return jobs;
  }

  /**
   * Delete a session (soft delete)
   */
  async deleteSession(sessionId: bigint): Promise<void> {
    await db.exec`
      UPDATE agent_sessions
      SET deleted_at = NOW()
      WHERE id = ${sessionId}
    `;

    console.log(`[Context Manager] Deleted session ${sessionId}`);
  }

  /**
   * Get shared context between code and terminal agents for a project
   * This is the key method for cross-agent context awareness
   */
  async getCrossAgentContext(projectId: bigint): Promise<{
    recentCodeActivity: AgentMessage[];
    recentTerminalActivity: AgentMessage[];
    sharedFiles: ContextItem[];
    sharedErrors: ContextItem[];
    activeJobs: AgentJob[];
  }> {
    // Get recent code agent activity
    const recentCodeActivity: AgentMessage[] = [];
    for await (const message of db.query<AgentMessage>`
      SELECT am.*
      FROM agent_messages am
      JOIN agent_sessions asess ON asess.id = am.session_id
      WHERE asess.project_id = ${projectId}
        AND am.agent_type = 'code'
        AND asess.deleted_at IS NULL
      ORDER BY am.created_at DESC
      LIMIT 10
    `) {
      recentCodeActivity.push(message);
    }

    // Get recent terminal agent activity
    const recentTerminalActivity: AgentMessage[] = [];
    for await (const message of db.query<AgentMessage>`
      SELECT am.*
      FROM agent_messages am
      JOIN agent_sessions asess ON asess.id = am.session_id
      WHERE asess.project_id = ${projectId}
        AND am.agent_type = 'terminal'
        AND asess.deleted_at IS NULL
      ORDER BY am.created_at DESC
      LIMIT 10
    `) {
      recentTerminalActivity.push(message);
    }

    // Get recently accessed files
    const sharedFiles: ContextItem[] = [];
    for await (const item of db.query<ContextItem>`
      SELECT * FROM context_items
      WHERE project_id = ${projectId}
        AND item_type = 'file'
      ORDER BY last_accessed_at DESC
      LIMIT 20
    `) {
      sharedFiles.push(item);
    }

    // Get recent errors
    const sharedErrors: ContextItem[] = [];
    for await (const item of db.query<ContextItem>`
      SELECT * FROM context_items
      WHERE project_id = ${projectId}
        AND item_type = 'error'
      ORDER BY created_at DESC
      LIMIT 10
    `) {
      sharedErrors.push(item);
    }

    // Get active jobs across all sessions
    const activeJobs: AgentJob[] = [];
    for await (const job of db.query<AgentJob>`
      SELECT aj.*
      FROM agent_jobs aj
      JOIN agent_sessions asess ON asess.id = aj.session_id
      WHERE asess.project_id = ${projectId}
        AND aj.status IN ('pending', 'running')
        AND asess.deleted_at IS NULL
      ORDER BY aj.created_at DESC
    `) {
      activeJobs.push(job);
    }

    return {
      recentCodeActivity,
      recentTerminalActivity,
      sharedFiles,
      sharedErrors,
      activeJobs
    };
  }
}

// Export singleton instance
export const contextManager = new ContextManager();
