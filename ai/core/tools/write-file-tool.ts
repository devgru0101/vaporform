/**
 * Write File Tool
 * Writes content to a file in the workspace (Daytona) and persists it to VFS (GridFS).
 */

import { AgentTool, ToolContext } from '../tool.js';
import { daytonaManager } from '../../../workspace/daytona-manager.js';
import { gridfs } from '../../../vfs/gridfs.js';
import { getMimeType } from '../../../shared/utils.js';
import { updateJobProgress } from '../utils/job-progress.js';
import { indexFileForRAG } from '../utils/rag-indexer.js';

interface WriteFileInput {
    path: string;
    content: string;
    line_count?: number;
}

interface WriteFileOutput {
    success: boolean;
    path: string;
    bytes: number;
}

export class WriteFileTool extends AgentTool<WriteFileInput, WriteFileOutput> {
    readonly name = 'write_to_file';
    readonly description = 'Write content to a file in the project workspace. Creates parent directories if needed. Overwrites existing files.';

    readonly inputSchema = {
        type: 'object' as const,
        properties: {
            path: {
                type: 'string',
                description: 'Absolute path to the file (e.g. /src/index.ts)',
            },
            content: {
                type: 'string',
                description: 'The full content to write to the file',
            },
            line_count: {
                type: 'number',
                description: 'Expected number of lines in the content (for validation)',
            },
        },
        required: ['path', 'content'],
    };

    async execute(input: WriteFileInput, context: ToolContext): Promise<WriteFileOutput> {
        const { path, content, line_count } = input;
        const { workspaceId, projectId, sessionId } = context;

        if (!workspaceId) {
            throw new Error('No workspace configured for this session');
        }

        // Validate line count if provided
        if (line_count !== undefined) {
            const actualLines = content.split('\n').length;
            if (actualLines !== line_count) {
                console.warn(`[WriteFileTool] Line count mismatch: expected ${line_count}, got ${actualLines}`);
            }
        }

        // 1. Write to Daytona first (executable)
        if (workspaceId) {
            await daytonaManager.writeFile(workspaceId, path, content);
            console.log(`[WriteFileTool] Wrote to Daytona: ${path}`);
        }

        // 2. Backup to GridFS (persistence)
        const mimeType = getMimeType(path);
        await gridfs.writeFile(projectId, path, Buffer.from(content, 'utf-8'), mimeType);
        console.log(`[WriteFileTool] Backed up to VFS: ${path}`);

        // 3. Update job progress if applicable (legacy job system)
        // We treat sessionId as jobId for compatibility if needed, or pass explicit jobId in context if we update Context
        // For now, let's assume context might have a jobId or we just log generic progress
        // The base ToolContext uses 'sessionId', but legacy 'tool-handlers' used 'jobId'.
        // We'll trust the user to pass a valid ID in the context if they need progress tracking.
        const trackingId = (context as any).jobId || sessionId;
        if (trackingId) {
            await updateJobProgress(trackingId, `Created ${path}`);
            await indexFileForRAG(projectId, path, content, trackingId);
        }

        return {
            success: true,
            path,
            bytes: content.length,
        };
    }
}
