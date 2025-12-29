
import { Daytona, Sandbox } from '@daytonaio/sdk';

export type WorkspaceStatus = 'pending' | 'starting' | 'running' | 'stopped' | 'error' | 'deleted';

export interface Workspace {
    id: bigint;
    project_id: bigint;
    daytona_sandbox_id?: string;
    name: string;
    status: WorkspaceStatus;
    language?: string;
    preview_port?: number;  // Port where dev server is running (set by agent)
    metadata?: Record<string, any>;  // Additional workspace metadata
    resources?: Record<string, number>;
    environment?: Record<string, string>;
    ports?: Record<string, number>;
    error_message?: string;
    auto_stop_interval?: number;
    auto_archive_interval?: number;
    ephemeral?: boolean;
    started_at?: Date;
    stopped_at?: Date;
    created_at: Date;
    updated_at: Date;
}

export interface Build {
    id: bigint;
    project_id: bigint;
    workspace_id?: bigint;
    status: 'pending' | 'building' | 'success' | 'failed';
    build_logs?: string;
    error_message?: string;
    duration_ms?: number;
    started_at?: Date;
    completed_at?: Date;
    created_at: Date;
}

export interface DaytonaContext {
    daytona: Daytona | null;
    getWorkspace(workspaceId: bigint): Promise<Workspace>;
    getSandbox(workspaceOrId: Workspace | bigint): Promise<Sandbox>;
    addLog(workspaceId: bigint, level: 'info' | 'warn' | 'error' | 'debug', message: string): Promise<void>;

    // Helpers likely needed
    normalizeDaytonaLanguage(language?: string): string;
}
