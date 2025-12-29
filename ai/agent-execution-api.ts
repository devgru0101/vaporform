
import { api, Header } from 'encore.dev/api';
import { verifyClerkJWT } from '../shared/clerk-auth.js';
import { ensureProjectPermission } from '../projects/permissions.js';
import { executeAgentTool, ToolExecutionContext } from './tool-handlers.js';
import { db } from '../projects/db.js';
import { daytonaManager } from '../workspace/daytona-manager.js';

interface ExecuteToolRequest {
    authorization: Header<'Authorization'>;
    projectId: string;
    toolUse: {
        id: string; // Tool Use ID (from Anthropic)
        name: string; // Tool Name
        input: any;   // Tool Input Parameters
    };
    workspaceId?: string; // Optional: If known
}

interface ExecuteToolResponse {
    success: boolean;
    result?: any;
    error?: string;
}

/**
 * Execute an AI Agent Tool (Server-Side)
 * This allows the frontend to request execution of a tool that runs securely on the backend
 */
export const executeTool = api(
    { method: 'POST', path: '/ai/agent/execute-tool' },
    async (req: ExecuteToolRequest): Promise<ExecuteToolResponse> => {
        const { userId } = await verifyClerkJWT(req.authorization);
        const projectId = BigInt(req.projectId);

        // Verify permission (must have 'edit' access to execute tools)
        await ensureProjectPermission(userId, projectId, 'edit');

        console.log(`[Execute Tool] Request for tool "${req.toolUse.name}" on project ${projectId}`);

        // Get workspace ID (either from request or lookup)
        let workspaceId = req.workspaceId ? BigInt(req.workspaceId) : undefined;

        if (!workspaceId) {
            // Lookup workspace for project
            const workspace = await daytonaManager.getProjectWorkspace(projectId);
            if (workspace) {
                workspaceId = workspace.id;
            }
        }

        if (!workspaceId && requiresWorkspace(req.toolUse.name)) {
            // Create workspace if needed and missing? 
            // For now, assume workspace exists or tool doesn't need it.
            // But if it needs it and it's missing, we might fail.
            // Ideally, the chat agent should have ensured workspace is running.
            console.warn(`[Execute Tool] Tool "${req.toolUse.name}" might require workspace but none found/provided.`);
        }

        // Create a dummy job ID for tracking (since this is an interactive chat tool execution, not a background job)
        // In the future, we might want to track these executions in a separate table
        const jobId = BigInt(0);

        const context: ToolExecutionContext = {
            workspaceId: workspaceId || BigInt(0), // Pass 0 if no workspace, tool handler checks availability
            projectId: projectId,
            jobId: jobId,
            userId: userId // Add userId to context (if tool handlers need it)
        };

        try {
            // Map the flattened ToolUse structure to what executeAgentTool expects
            // executeAgentTool expects { tool: string, params: any, id: string }
            // The request provides { name: string, input: any, id: string }
            const toolUseInternal = {
                name: req.toolUse.name,
                input: req.toolUse.input,
                id: req.toolUse.id
            };

            const result = await executeAgentTool(toolUseInternal, context);

            return {
                success: result.success,
                result: result.result,
                error: result.error
            };

        } catch (error: any) {
            console.error(`[Execute Tool] Failed to execute tool:`, error);
            return {
                success: false,
                error: error.message || 'Unknown error during tool execution'
            };
        }
    }
);

// Helper to check if a tool strictly requires a workspace
function requiresWorkspace(toolName: string): boolean {
    const workspaceTools = [
        'read_file', 'write_to_file', 'execute_command', 'list_files', 'search_files',
        'git_status', 'git_commit', 'git_diff',
        'daytona_execute_command', 'daytona_read_file', 'daytona_write_file'
    ];
    return workspaceTools.includes(toolName);
}
