// Vaporform Agentic Code Engine Types
// Based on KiloCode architecture, adapted for web-based usage

export type ToolName =
  | 'read_file'
  | 'write_to_file'
  | 'execute_command'
  | 'list_files'
  | 'search_files'
  | 'ask_followup_question'
  | 'attempt_completion'
  | 'daytona_execute_command'
  | 'daytona_get_workspace_status'
  | 'ensure_workspace_running'
  | 'restart_workspace'
  | 'daytona_read_file'
  | 'daytona_write_file'
  | 'daytona_list_files'
  | 'daytona_get_preview_url'
  | 'start_interactive_session'
  | 'send_pty_input'
  | 'get_pty_status'
  | 'kill_pty_session'
  | 'list_pty_sessions'
  | 'start_dev_server';

export type MessageRole = 'user' | 'assistant' | 'tool';

export type ToolStatus = 'pending' | 'approved' | 'denied' | 'executing' | 'completed' | 'error';

// Tool use structure (similar to KiloCode's ToolUse)
export interface ToolUse {
  id: string;
  tool: ToolName;
  params: Record<string, any>;
  status: ToolStatus;
  partial?: boolean;
}

// Tool result structure
export interface ToolResult {
  tool_use_id: string;
  content: string | { type: 'text'; text: string } | Array<{ type: 'text' | 'image'; text?: string; source?: any }>;
  error?: string;
  images?: string[];
}

// Message structure
export interface AgentMessage {
  id: string;
  role: MessageRole;
  content: string | Array<{ type: 'text' | 'tool_use' | 'tool_result'; [key: string]: any }>;
  timestamp: number;
  toolUse?: ToolUse;
  toolResult?: ToolResult;
}

// Agent state
export interface AgentState {
  messages: AgentMessage[];
  currentTask: string | null;
  isThinking: boolean;
  isExecuting: boolean;
  pendingApprovals: ToolUse[];
}

// File operation types
export interface ReadFileParams {
  path: string;
  line_range?: { start: number; end: number };
}

export interface WriteFileParams {
  path: string;
  content: string;
  line_count?: number;
}

export interface ExecuteCommandParams {
  command: string;
  cwd?: string;
}

export interface ListFilesParams {
  path?: string;
  recursive?: boolean;
}

export interface SearchFilesParams {
  pattern: string;
  path?: string;
}

export interface AskFollowupParams {
  question: string;
}

export interface AttemptCompletionParams {
  result?: string;
  command?: string;
}

// Tool execution context
export interface ToolExecutionContext {
  projectId: string;
  workspaceId?: string;
  userId: string;
  cwd: string;
}

// Tool approval callback
export type ToolApprovalCallback = (tool: ToolUse) => Promise<{ approved: boolean; feedback?: string; images?: string[] }>;

// Tool execution callback
export type ToolExecutionCallback = (tool: ToolUse, context: ToolExecutionContext) => Promise<ToolResult>;

// Agent configuration
export interface AgentConfig {
  autoApproveReadOnly: boolean;
  autoApproveWrite: boolean;
  autoApproveExecute: boolean;
  maxTokens: number;
  temperature: number;
  model: string;
}
