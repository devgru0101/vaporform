/**
 * Memory Tool
 * Allows agents to recall past information and remember new facts using Mem0.
 */

import { AgentTool, ToolContext } from '../tool.js';
import { mem0Manager } from '../../memory/mem0-manager.js';

interface MemoryToolInput {
    action: 'recall' | 'remember' | 'forget' | 'dump';
    content?: string; // For adding memory or searching
    query?: string;   // For searching (optional, defaults to content if not provided)
    limit?: number;
}

interface MemoryToolOutput {
    success: boolean;
    memories?: string[] | any[];
    message?: string;
}

export class MemoryTool extends AgentTool<MemoryToolInput, MemoryToolOutput> {
    readonly name = 'memory';
    readonly description = 'Access long-term memory. Use "recall" to optimize search for relevant info, "remember" to store important facts/decisions, "dump" to get all memories.';

    readonly inputSchema = {
        type: 'object' as const,
        properties: {
            action: {
                type: 'string',
                enum: ['recall', 'remember', 'forget', 'dump'],
                description: 'Action to perform: recall (search), remember (add), forget (delete - not impl yet), dump (get all)',
            },
            content: {
                type: 'string',
                description: 'The memory content to store (for remember) or query (for recall)',
            },
            query: {
                type: 'string',
                description: 'Specific search query (optional for recall, overrides content)',
            },
            limit: {
                type: 'number',
                description: 'Number of memories to retrieve (default 5)',
            },
        },
        required: ['action'],
    };

    async execute(input: MemoryToolInput, context: ToolContext): Promise<MemoryToolOutput> {
        const { action, content, query, limit = 5 } = input;
        const { userId } = context;

        if (!userId) {
            throw new Error('User ID required for memory operations');
        }

        switch (action) {
            case 'remember':
                if (!content) throw new Error('Content required for remember action');
                // Add metadata like projectId, sessionId for context
                await mem0Manager.addMemory(userId, content, {
                    projectId: context.projectId.toString(),
                    sessionId: context.sessionId.toString()
                });
                return { success: true, message: `Remembered: ${content}` };

            case 'recall':
                const searchQ = query || content;
                if (!searchQ) throw new Error('Query or Content required for recall action');
                const results = await mem0Manager.searchMemory(userId, searchQ, limit);
                return { success: true, memories: results };

            case 'dump':
                const all = await mem0Manager.getAllMemories(userId);
                return { success: true, memories: all };

            case 'forget':
                return { success: false, message: 'Forget action not implemented yet' };

            default:
                throw new Error(`Unknown action: ${action}`);
        }
    }
}
