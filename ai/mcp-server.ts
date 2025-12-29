
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// Tool Definitions (Inlined to avoid import resolution issues with tsx/Esbuild mismatch)
const AGENT_TOOLS: any[] = [
    {
        name: 'read_file',
        description: 'Read the contents of a file from the project workspace. Can read single files or multiple files at once for efficiency.',
        input_schema: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'The relative path to the file within the project workspace',
                },
                line_range: {
                    type: 'object',
                    description: 'Optional: Read only specific lines',
                    properties: {
                        start: { type: 'number' },
                        end: { type: 'number' },
                    },
                },
            },
            required: ['path'],
        },
    },
    {
        name: 'write_to_file',
        description: 'Create a new file or overwrite an existing file with new content. Always provide the complete file content.',
        input_schema: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'The relative path where the file should be created/updated',
                },
                content: {
                    type: 'string',
                    description: 'The complete content to write to the file',
                },
                line_count: {
                    type: 'number',
                    description: 'The number of lines in the content (for validation)',
                },
            },
            required: ['path', 'content'],
        },
    },
    {
        name: 'delete_file',
        description: 'Delete a file or directory. Use recursive=true to delete non-empty directories.',
        input_schema: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'The relative path to the file or directory to delete',
                },
                recursive: {
                    type: 'boolean',
                    description: 'Delete recursively (required for non-empty directories)',
                    default: false,
                },
            },
            required: ['path'],
        },
    },
    {
        name: 'execute_command',
        description: 'Execute a shell command in the project workspace terminal. Use this for running builds, tests, installing packages, etc.',
        input_schema: {
            type: 'object',
            properties: {
                command: {
                    type: 'string',
                    description: 'The shell command to execute',
                },
                cwd: {
                    type: 'string',
                    description: 'Optional: Working directory (relative to project root)',
                },
            },
            required: ['command'],
        },
    },
    {
        name: 'list_files',
        description: 'List files and directories in the project workspace',
        input_schema: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'Optional: Directory path to list (defaults to root)',
                },
                recursive: {
                    type: 'boolean',
                    description: 'Whether to list files recursively',
                },
            },
        },
    },
    {
        name: 'search_files',
        description: 'Search for files matching a pattern in the project workspace',
        input_schema: {
            type: 'object',
            properties: {
                pattern: {
                    type: 'string',
                    description: 'Search pattern (supports glob patterns)',
                },
                path: {
                    type: 'string',
                    description: 'Optional: Directory to search in',
                },
            },
            required: ['pattern'],
        },
    },
    {
        name: 'ask_followup_question',
        description: 'Ask the user a follow-up question to gather more information',
        input_schema: {
            type: 'object',
            properties: {
                question: {
                    type: 'string',
                    description: 'The question to ask the user',
                },
            },
            required: ['question'],
        },
    },
    {
        name: 'attempt_completion',
        description: 'Present the result of the task to the user. Use this when you have completed the task.',
        input_schema: {
            type: 'object',
            properties: {
                result: {
                    type: 'string',
                    description: 'Summary of what was accomplished',
                },
                command: {
                    type: 'string',
                    description: 'Optional: A command for the user to run to verify the result',
                },
            },
        },
    },
    {
        name: 'run_code',
        description: 'Execute code in the sandbox runtime. Supports Python, TypeScript, and JavaScript. Returns stdout, stderr, exit code, and matplotlib chart artifacts. Use for testing/validating code before deployment.',
        input_schema: {
            type: 'object',
            properties: {
                code: {
                    type: 'string',
                    description: 'The code to execute',
                },
                language: {
                    type: 'string',
                    enum: ['python', 'typescript', 'javascript'],
                    description: 'Programming language to use',
                },
                timeout: {
                    type: 'number',
                    description: 'Timeout in seconds (default: 30)',
                    default: 30,
                },
            },
            required: ['code', 'language'],
        },
    },
    {
        name: 'edit_file',
        description: 'Make a targeted edit to a file by replacing old_text with new_text. More efficient than write_to_file for small changes. The old_text must match exactly.',
        input_schema: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'The relative path to the file to edit',
                },
                old_text: {
                    type: 'string',
                    description: 'The exact text to find and replace (must match exactly including whitespace)',
                },
                new_text: {
                    type: 'string',
                    description: 'The new text to replace with',
                },
            },
            required: ['path', 'old_text', 'new_text'],
        },
    },
    {
        name: 'git_status',
        description: 'Get the current git status showing modified, added, and deleted files.',
        input_schema: {
            type: 'object',
            properties: {},
        },
    },
    {
        name: 'git_commit',
        description: 'Commit all staged changes with a message. Automatically stages all modified files before committing.',
        input_schema: {
            type: 'object',
            properties: {
                message: {
                    type: 'string',
                    description: 'The commit message',
                },
            },
            required: ['message'],
        },
    },
    {
        name: 'git_log',
        description: 'Get the commit history for the project.',
        input_schema: {
            type: 'object',
            properties: {
                limit: {
                    type: 'number',
                    description: 'Maximum number of commits to return (default: 10)',
                    default: 10,
                },
            },
        },
    },
    {
        name: 'git_diff',
        description: 'Show the diff of uncommitted changes.',
        input_schema: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'Optional: Show diff for specific file',
                },
            },
        },
    },
    {
        name: 'install_package',
        description: 'Install a package using the project\'s package manager (npm, yarn, pnpm). Detects package manager automatically.',
        input_schema: {
            type: 'object',
            properties: {
                package: {
                    type: 'string',
                    description: 'Package name to install (e.g., "react", "express", "@types/node")',
                },
                dev: {
                    type: 'boolean',
                    description: 'Install as dev dependency',
                    default: false,
                },
                version: {
                    type: 'string',
                    description: 'Specific version to install (e.g., "^18.0.0")',
                },
            },
            required: ['package'],
        },
    },
    {
        name: 'remove_package',
        description: 'Remove a package using the project\'s package manager.',
        input_schema: {
            type: 'object',
            properties: {
                package: {
                    type: 'string',
                    description: 'Package name to remove',
                },
            },
            required: ['package'],
        },
    },
    {
        name: 'submit_implementation_plan',
        description: 'Submit a comprehensive implementation plan for user approval. MUST be used before writing code or making changes. The plan should detail all proposed file changes and commands.',
        input_schema: {
            type: 'object',
            properties: {
                plan: {
                    type: 'string',
                    description: 'The detailed implementation plan in Markdown format.',
                },
            },
            required: ['plan'],
        },
    },
];

const DAYTONA_TOOLS: any[] = [
    {
        name: 'daytona_execute_command',
        description: 'Execute a shell command in the project\'s Daytona sandbox. Use this to run builds, tests, install packages, start servers, or debug issues in the running environment.',
        input_schema: {
            type: 'object',
            properties: {
                command: {
                    type: 'string',
                    description: 'The shell command to execute in the sandbox',
                },
            },
            required: ['command'],
        },
    },
    {
        name: 'daytona_read_file',
        description: 'Read a file from the Daytona sandbox. Use this to inspect files in the actual running environment, check generated files, or debug issues.',
        input_schema: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'Path to the file in the sandbox (relative to workspace root)',
                },
            },
            required: ['path'],
        },
    },
    {
        name: 'daytona_write_file',
        description: 'Write a file to the Daytona sandbox. Use this to create or update files in the running environment.',
        input_schema: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'Path where the file should be written in the sandbox',
                },
                content: {
                    type: 'string',
                    description: 'Content to write to the file',
                },
            },
            required: ['path', 'content'],
        },
    },
    {
        name: 'daytona_list_files',
        description: 'List files in the Daytona sandbox. Use this to explore the directory structure of the running environment.',
        input_schema: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'Directory path to list (defaults to workspace root)',
                },
            },
        },
    },
    {
        name: 'daytona_get_preview_url',
        description: 'Get the preview URL for the running application in the Daytona sandbox. Use this to provide the user with a link to view their application.',
        input_schema: {
            type: 'object',
            properties: {},
        },
    },
    {
        name: 'daytona_git_clone',
        description: 'Clone a Git repository into the Daytona sandbox workspace.',
        input_schema: {
            type: 'object',
            properties: {
                url: {
                    type: 'string',
                    description: 'Git repository URL',
                },
                path: {
                    type: 'string',
                    description: 'Target directory in sandbox',
                },
                branch: {
                    type: 'string',
                    description: 'Branch to clone (optional)',
                },
            },
            required: ['url', 'path'],
        },
    },
    {
        name: 'daytona_get_workspace_status',
        description: 'Get the status of the Daytona workspace (running, stopped, error, etc.). Use this to check if the workspace is ready before executing commands.',
        input_schema: {
            type: 'object',
            properties: {},
        },
    },
    {
        name: 'ensure_workspace_running',
        description: 'Ensure the Daytona workspace is running before performing operations. Automatically starts stopped workspaces and recovers errored ones. Use this if you get "workspace not running" errors or before critical operations.',
        input_schema: {
            type: 'object',
            properties: {
                wait_for_ready: {
                    type: 'boolean',
                    description: 'Wait up to 60 seconds for workspace to reach running status (default: true)',
                },
            },
        },
    },
    {
        name: 'restart_workspace',
        description: 'Explicitly restart the Daytona workspace. Use when you need a fresh environment (e.g., after changing environment variables, installing system packages, or persistent errors). For most errors, use ensure_workspace_running instead.',
        input_schema: {
            type: 'object',
            properties: {
                reason: {
                    type: 'string',
                    description: 'Why the restart is needed (for logging and user communication)',
                },
            },
        },
    },
    {
        name: 'force_rebuild_workspace',
        description: 'DESTRUCTIVE: Delete the workspace and create a new one from scratch. Only use when the sandbox is corrupted beyond repair (e.g., broken dependencies, filesystem errors that restart cannot fix). All running processes will be terminated. Files are preserved via VFS backup and will be restored.',
        input_schema: {
            type: 'object',
            properties: {
                confirm: {
                    type: 'boolean',
                    description: 'Must be true to confirm this destructive operation',
                },
                reason: {
                    type: 'string',
                    description: 'Explain why force rebuild is necessary (required for audit trail)',
                },
            },
            required: ['confirm', 'reason'],
        },
    },
];

// Initialize MCP Server
const server = new McpServer({
    name: "vaporform-backend",
    version: "1.0.0"
});

// Configure Backend URL
const BACKEND_URL = process.env.VAPORFORM_API_URL || "http://127.0.0.1:4000";
const MOCK_JWT = "mock-jwt"; // In real usage, this might need a real token or system key

// Combine all tools
const allTools = [...AGENT_TOOLS, ...DAYTONA_TOOLS];

// Register tools
for (const tool of allTools) {
    server.tool(
        tool.name,
        tool.input_schema,
        async (args: any) => {
            try {
                console.error(`[MCP] Proxying tool execution: ${tool.name}`);

                const response = await fetch(`${BACKEND_URL}/ai/agent/execute-tool`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${MOCK_JWT}`
                    },
                    body: JSON.stringify({
                        projectId: process.env.VAPORFORM_PROJECT_ID || "33792404620018510", // Default or Env
                        toolUse: {
                            name: tool.name,
                            input: args,
                            id: `mcp-${Date.now()}` // Generate a dummy ID
                        },
                        workspaceId: process.env.VAPORFORM_WORKSPACE_ID // Optional
                    })
                });

                if (!response.ok) {
                    const text = await response.text();
                    return {
                        content: [{ type: "text" as const, text: `Backend Error (${response.status}): ${text}` }],
                        isError: true
                    };
                }

                const result = await response.json();

                // Format result for MCP
                return {
                    content: [{ type: "text" as const, text: typeof result === 'string' ? result : JSON.stringify(result, null, 2) }]
                };

            } catch (error: any) {
                return {
                    content: [{ type: "text" as const, text: `MCP Proxy Error: ${error.message}` }],
                    isError: true
                };
            }
        }
    );
}

// Start Server
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Vaporform MCP Server running on stdio (Proxy Mode)");
}

main().catch((error) => {
    console.error("Fatal error in MCP server:", error);
    process.exit(1);
});
