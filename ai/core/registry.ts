/**
 * Tool Registry
 * Manages the registration and retrieval of agent tools.
 */

import { AgentTool } from './tool.js';
import { WriteFileTool } from './tools/write-file-tool.js';
import { ExecuteCommandTool } from './tools/execute-command-tool.js';
import { ReadFileTool } from './tools/read-file-tool.js';
import { EditFileTool } from './tools/edit-file-tool.js';
import { MemoryTool } from './tools/memory-tool.js';
import type { Anthropic } from '@anthropic-ai/sdk';

export class ToolRegistry {
    private tools: Map<string, AgentTool> = new Map();

    constructor() {
        this.register(new WriteFileTool());
        this.register(new ExecuteCommandTool());
        this.register(new ReadFileTool());
        this.register(new EditFileTool());
        this.register(new MemoryTool());
    }

    register(tool: AgentTool) {
        if (this.tools.has(tool.name)) {
            console.warn(`[ToolRegistry] Overwriting existing tool: ${tool.name}`);
        }
        this.tools.set(tool.name, tool);
    }

    getTool(name: string): AgentTool | undefined {
        return this.tools.get(name);
    }

    /**
     * Get all tool definitions formatting for Anthropic API
     */
    getDefinitions(): Anthropic.Tool[] {
        return Array.from(this.tools.values()).map(tool => tool.definition as Anthropic.Tool);
    }

    /**
     * Execute a tool by name
     */
    async execute(name: string, input: any, context: any): Promise<any> {
        const tool = this.getTool(name);
        if (!tool) {
            throw new Error(`Tool not found: ${name}`);
        }
        return tool.execute(input, context);
    }
}

export const toolRegistry = new ToolRegistry();
