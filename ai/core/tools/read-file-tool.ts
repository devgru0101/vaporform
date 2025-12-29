/**
 * Read File Tool
 * Reads content from files in the workspace or VFS.
 */

import { AgentTool, ToolContext } from '../tool.js';
import { daytonaManager } from '../../../workspace/daytona-manager.js';
import { gridfs } from '../../../vfs/gridfs.js';

interface ReadFileToolInput {
    path: string;
}

interface ReadFileToolOutput {
    content: string;
    source: 'workspace' | 'vfs';
    error?: string;
}

export class ReadFileTool extends AgentTool<ReadFileToolInput, ReadFileToolOutput> {
    readonly name = 'read_file';
    readonly description = 'Read the contents of a file. Prioritizes the active workspace if available, falls back to VFS.';

    readonly inputSchema = {
        type: 'object' as const,
        properties: {
            path: {
                type: 'string',
                description: 'Absolute path to the file (e.g., /src/index.ts)',
            },
        },
        required: ['path'],
    };

    async execute(input: ReadFileToolInput, context: ToolContext): Promise<ReadFileToolOutput> {
        const { path } = input;
        const { workspaceId, projectId } = context;

        // 1. Try reading from Daytona Workspace first (most up-to-date)
        if (workspaceId) {
            try {
                const workspace = await daytonaManager.getWorkspace(workspaceId);
                if (workspace && workspace.status === 'running') {
                    // Use cat to read file
                    const result = await daytonaManager.executeCommand(workspaceId, `cat "${path}"`);

                    if (result.exitCode === 0) {
                        return {
                            content: result.stdout,
                            source: 'workspace'
                        };
                    } else {
                        // File might not exist in workspace, or other error.
                        // If it doesn't exist, we might fall back to VFS, but usually workspace should be in sync.
                        console.warn(`[ReadFileTool] Failed to read from workspace: ${result.stderr}`);
                    }
                }
            } catch (error) {
                console.warn(`[ReadFileTool] Error reading from workspace:`, error);
            }
        }

        // 2. Fall back to GridFS (VFS)
        try {
            // GridFS usually stores files by filename/path and metadata?
            // Need to check how gridfs.js is implemented. Assuming standard retrieval.
            // Based on tool-handlers.ts usage (which I'll check in parallel), usually it's `gridfs.downloadByName` or similar.
            // I will assume a logic similar to what I see in search results or existing knowledge.
            // Actually, I'll defer the exact VFS call until I see `handleReadFile`.
            // For now, I'll use a placeholder implementation that I will update in next step after verifying `handleReadFile`.

            const buffer = await gridfs.readFile(projectId, path);
            return {
                content: buffer.toString('utf-8'),
                source: 'vfs'
            };

        } catch (error) {
            throw new Error(`File not found in VFS or Workspace: ${path}`);
        }
    }
}
