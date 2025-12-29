/**
 * Base Agent Tool
 * Abstract base class for all agent tools, inspired by KiloCode's modular architecture.
 */

export interface ToolContext {
    projectId: bigint;
    sessionId: bigint;
    workspaceId?: bigint;
    userId: string;
}

export interface ToolDefinition {
    name: string;
    description: string;
    input_schema: {
        type: 'object';
        properties: Record<string, any>;
        required?: string[];
    };
}

export abstract class AgentTool<Input = any, Output = any> {
    abstract readonly name: string;
    abstract readonly description: string;
    abstract readonly inputSchema: ToolDefinition['input_schema'];

    /**
     * Get the Anthropic tool definition
     */
    get definition(): ToolDefinition {
        return {
            name: this.name,
            description: this.description,
            input_schema: this.inputSchema,
        };
    }

    /**
     * Execute the tool with the given input and context
     */
    abstract execute(input: Input, context: ToolContext): Promise<Output>;
}
