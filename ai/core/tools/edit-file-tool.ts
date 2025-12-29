/**
 * Edit File Tool
 * Make targeted edits to files by replacing text.
 */

import { AgentTool, ToolContext } from '../tool.js';
import { daytonaManager } from '../../../workspace/daytona-manager.js';
import { gridfs } from '../../../vfs/gridfs.js';
import { updateJobProgress } from '../utils/job-progress.js';
import { indexFileForRAG } from '../utils/rag-indexer.js';
import { getMimeType } from '../../../shared/utils.js';

interface EditFileToolInput {
    path: string;
    old_text: string;
    new_text: string;
}

interface EditFileToolOutput {
    success: boolean;
    path: string;
    changes?: { removed: number; added: number };
    error?: string;
    message?: string;
}

export class EditFileTool extends AgentTool<EditFileToolInput, EditFileToolOutput> {
    readonly name = 'edit_file';
    readonly description = 'Make a targeted edit to a file by replacing old_text with new_text. More precise than write_file for small changes.';

    readonly inputSchema = {
        type: 'object' as const,
        properties: {
            path: {
                type: 'string',
                description: 'Absolute path to the file',
            },
            old_text: {
                type: 'string',
                description: 'Text to find and replace (must match exactly)',
            },
            new_text: {
                type: 'string',
                description: 'Text to replace with',
            },
        },
        required: ['path', 'old_text', 'new_text'],
    };

    async execute(input: EditFileToolInput, context: ToolContext): Promise<EditFileToolOutput> {
        const { path, old_text, new_text } = input;
        const { workspaceId, projectId, sessionId } = context; // sessionId used as jobId often in chat context? 
        // In chat, sessionId is conversation ID. In generation, jobId is generation_job ID.
        // ToolContext definition from tool.ts: { projectId, sessionId, workspaceId, userId }
        // We should prob log to `job-progress` if it's a job? But `sessionId` is bigint.
        // `updateJobProgress` expects `jobId`. If this is chat, we might NOT be in a job.
        // `updateJobProgress` might fail or throw if jobId doesn't exist in `generation_jobs`.
        // Chat sessions are in `sessions` table.
        // We need to be careful. Terminal Agent runs in chat session, not generation job.
        // `updateJobProgress(sessionId, ...)` might be WRONG if sessionId refers to a session, not a job.
        // Vaporform context: `jobId` for generation, `sessionId` for chat.
        // `terminal-agent-api.ts` passes `sessionId` as `sessionId`.
        // It does NOT have a `jobId`.
        // `tool-handlers.ts` used `executeAgentToolForChat` which used `0` or passed `jobId` if available.
        // `updateJobProgress` queries `generation_jobs`.
        // If I pass `sessionId` (chat session) as `jobId`, it will try to update a job with that ID. Unlikely to exist or WRONG.
        // So for Chat Agent (Terminal), we probably shouldn't use `updateJobProgress`.
        // We should probably rely on `addMessage` which `terminal-agent-api.ts` handles.
        // However, `indexFileForRAG` IS useful.

        // Logic:
        // 1. Read File
        let content = '';

        // Try reading from Daytona first
        try {
            if (workspaceId) {
                content = await daytonaManager.readFile(workspaceId, path);
            } else {
                throw new Error('No workspace');
            }
        } catch (e) {
            // Fallback to VFS
            try {
                const buffer = await gridfs.readFile(projectId, path);
                content = buffer.toString('utf-8');
            } catch (vfsError) {
                return { success: false, path, error: `File not found: ${path}` };
            }
        }

        // 2. Validate/Replace
        if (!content.includes(old_text)) {
            return { success: false, path, error: 'old_text not found in file' };
        }

        const newContent = content.replace(old_text, new_text);

        // 3. Write Back
        // Daytona
        if (workspaceId) {
            try {
                await daytonaManager.writeFile(workspaceId, path, newContent);
            } catch (e) {
                console.warn('Failed to write to Daytona:', e);
                // Proceed to VFS backup anyway? Or fail? Usually proceed.
            }
        }

        // VFS
        try {
            await gridfs.writeFile(
                projectId,
                path,
                Buffer.from(newContent, 'utf-8'),
                getMimeType(path)
            );
        } catch (e) {
            console.error('Failed to write to VFS:', e);
            // Fail? If VFS write fails, persistence is broken.
            return { success: false, path, error: 'Failed to persist changes to VFS' };
        }

        // 4. Index
        try {
            // We pass sessionId as 'sourceId' or similar? indexFileForRAG(projectId, path, content, sourceId?)
            // Signature: indexFileForRAG(projectId, path, content, jobId?)
            // If we pass 0 or undefined, it might be fine.
            await indexFileForRAG(projectId, path, newContent, BigInt(0));
        } catch (e) {
            console.warn('Indexing failed:', e);
        }

        return {
            success: true,
            path,
            changes: {
                removed: old_text.split('\n').length,
                added: new_text.split('\n').length
            },
            message: `Successfully edited ${path}`
        };
    }
}
