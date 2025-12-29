/**
 * Execute Command Tool
 * Executes a bash command in the Daytona workspace or locally if configured.
 * Aligned with KiloCode's ExecuteCommandTool logic but adapted for Daytona.
 */

import { AgentTool, ToolContext } from '../tool.js';
import { daytonaManager } from '../../../workspace/daytona-manager.js';
import { updateJobProgress } from '../utils/job-progress.js';

interface ExecuteCommandInput {
    command: string;
    cwd?: string; // Not fully supported by Daytona API yet, but good to have in schema
    timeout?: number;
}

interface ExecuteCommandOutput {
    stdout: string;
    stderr: string;
    exitCode: number;
}

export class ExecuteCommandTool extends AgentTool<ExecuteCommandInput, ExecuteCommandOutput> {
    readonly name = 'execute_command';
    readonly description = 'Execute a bash command in the project workspace (Daytona). Use for running build scripts, tests, managing files, etc.';

    readonly inputSchema = {
        type: 'object' as const,
        properties: {
            command: {
                type: 'string',
                description: 'The bash command to execute',
            },
            timeout: {
                type: 'number',
                description: 'Timeout in milliseconds (default: 60000)',
            },
        },
        required: ['command'],
    };

    async execute(input: ExecuteCommandInput, context: ToolContext): Promise<ExecuteCommandOutput> {
        const { command } = input;
        const { workspaceId, sessionId } = context;

        if (!workspaceId) {
            throw new Error('No workspace configured for this session');
        }

        console.log(`[ExecuteCommandTool] Executing: ${command}`);

        // Optional: log progress
        const trackingId = (context as any).jobId || sessionId;
        if (trackingId) {
            // Don't spam progress updates for every ls/grep, only "significant" commands?
            // For now, let's just log it internally or keep it lightweight.
            // await updateJobProgress(trackingId, `Running: ${command}`);
        }

        // Execute in Daytona
        // Note: Daytona manager should handle the actual execution logic
        // We assume daytonaManager.executeCommand returns { stdout, stderr, exitCode }
        try {
            const result = await daytonaManager.executeCommand(workspaceId, command);

            console.log(`[ExecuteCommandTool] Result (Exit ${result.exitCode})`);
            // console.log(`[ExecuteCommandTool] Stdout: ${result.stdout}`);
            // console.log(`[ExecuteCommandTool] Stderr: ${result.stderr}`);

            return {
                stdout: result.stdout || '',
                stderr: result.stderr || '',
                exitCode: result.exitCode || 0
            };
        } catch (error) {
            console.error(`[ExecuteCommandTool] Failed:`, error);
            return {
                stdout: '',
                stderr: error instanceof Error ? error.message : String(error),
                exitCode: 1
            };
        }
    }
}
