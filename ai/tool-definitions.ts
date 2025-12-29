
export const AGENT_TOOLS: any[] = [
    // FILE OPERATIONS REMOVED - Use DAYTONA_TOOLS instead
    // (daytona_read_file, daytona_write_file, daytona_list_files)
    // This implements the Hybrid Git+Daytona architecture where:
    // - Agent writes to Daytona sandbox (fast, ~10ms)
    // - Changes auto-commit to Git (persistent, version controlled)
    // - No GridFS dependency (speed critical)

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
    // GIT VERSION CONTROL TOOLS (Hybrid Git+Daytona Architecture)
    // These tools enable full undo/redo capability via Git commits
    {
        name: 'git_commit',
        description: 'Commit all current changes to Git with a message. Creates a save point that can be undone/redone later. Use this after completing a significant change or feature.',
        input_schema: {
            type: 'object',
            properties: {
                message: {
                    type: 'string',
                    description: 'Commit message describing the changes (e.g., "Add user authentication", "Fix login bug")',
                },
            },
            required: ['message'],
        },
    },
    {
        name: 'git_undo',
        description: 'Undo the last commit and revert files to the previous state. This moves HEAD back one commit. Can be redone later with git_redo.',
        input_schema: {
            type: 'object',
            properties: {
                steps: {
                    type: 'number',
                    description: 'Number of commits to undo (default: 1)',
                    default: 1,
                },
            },
        },
    },
    {
        name: 'git_redo',
        description: 'Redo a previously undone commit. Moves HEAD forward to restore changes that were undone.',
        input_schema: {
            type: 'object',
            properties: {
                steps: {
                    type: 'number',
                    description: 'Number of commits to redo (default: 1)',
                    default: 1,
                },
            },
        },
    },
    {
        name: 'git_status',
        description: 'Show the current Git status including uncommitted changes, current branch, and commit history. Use this to see what changes have been made since the last commit.',
        input_schema: {
            type: 'object',
            properties: {},
        },
    },
    {
        name: 'git_log',
        description: 'Show the commit history with messages and timestamps. Use this to see all previous save points.',
        input_schema: {
            type: 'object',
            properties: {
                limit: {
                    type: 'number',
                    description: 'Number of recent commits to show (default: 10)',
                    default: 10,
                },
            },
        },
    },
];

export const DAYTONA_TOOLS: any[] = [
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
        description: 'Read a file from the Daytona sandbox. Use this to inspect files in the actual running environment, check generated files, or debug issues. IMPORTANT: If you get a "File not found" error, the file does not exist yet - you should create it using daytona_write_file instead of retrying the read. Always handle missing files gracefully by creating them.',
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
        description: 'List files in the Daytona sandbox. Use this to explore the directory structure of the running environment. IMPORTANT: If you get a "DIRECTORY_NOT_FOUND" message, the directory does not exist yet - you should create it using daytona_write_file or note it for investigation. Always handle missing directories gracefully by creating them as needed.',
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
        name: 'daytona_set_preview_port',
        description: 'Set the port where the dev server is running for preview URL generation. IMPORTANT: Call this after starting a dev server so the preview link uses the correct port. Works for ANY framework on ANY port 3000-9999.',
        input_schema: {
            type: 'object',
            properties: {
                port: {
                    type: 'number',
                    description: 'Port number (3000-9999) where the dev server is listening. Common: Vite=5173, Next.js=3000, Angular=4200, Django=8000, Flask=5000',
                },
            },
            required: ['port'],
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
        name: 'daytona_git_status',
        description: 'Get git status of repository in workspace. Shows modified, staged, and untracked files.',
        input_schema: {
            type: 'object',
            properties: {
                repo_path: {
                    type: 'string',
                    description: 'Repository path relative to sandbox (e.g., "workspace/myrepo")',
                },
            },
            required: ['repo_path'],
        },
    },
    {
        name: 'daytona_git_add',
        description: 'Stage files for commit. Use ["."] to stage all changes.',
        input_schema: {
            type: 'object',
            properties: {
                repo_path: {
                    type: 'string',
                    description: 'Repository path',
                },
                files: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Files to stage (use ["."] for all changes)',
                },
            },
            required: ['repo_path', 'files'],
        },
    },
    {
        name: 'daytona_git_commit',
        description: 'Commit staged changes with message and author info.',
        input_schema: {
            type: 'object',
            properties: {
                repo_path: {
                    type: 'string',
                    description: 'Repository path',
                },
                message: {
                    type: 'string',
                    description: 'Commit message',
                },
                author: {
                    type: 'string',
                    description: 'Author name',
                },
                email: {
                    type: 'string',
                    description: 'Author email',
                },
            },
            required: ['repo_path', 'message', 'author', 'email'],
        },
    },
    {
        name: 'daytona_git_push',
        description: 'Push commits to remote repository.',
        input_schema: {
            type: 'object',
            properties: {
                repo_path: {
                    type: 'string',
                    description: 'Repository path',
                },
            },
            required: ['repo_path'],
        },
    },
    {
        name: 'daytona_git_pull',
        description: 'Pull changes from remote repository.',
        input_schema: {
            type: 'object',
            properties: {
                repo_path: {
                    type: 'string',
                    description: 'Repository path',
                },
            },
            required: ['repo_path'],
        },
    },
    {
        name: 'daytona_git_branches',
        description: 'List all branches in repository.',
        input_schema: {
            type: 'object',
            properties: {
                repo_path: {
                    type: 'string',
                    description: 'Repository path',
                },
            },
            required: ['repo_path'],
        },
    },
    {
        name: 'daytona_git_create_branch',
        description: 'Create a new branch.',
        input_schema: {
            type: 'object',
            properties: {
                repo_path: {
                    type: 'string',
                    description: 'Repository path',
                },
                branch_name: {
                    type: 'string',
                    description: 'Name of new branch',
                },
            },
            required: ['repo_path', 'branch_name'],
        },
    },
    {
        name: 'daytona_git_checkout_branch',
        description: 'Switch to a different branch.',
        input_schema: {
            type: 'object',
            properties: {
                repo_path: {
                    type: 'string',
                    description: 'Repository path',
                },
                branch_name: {
                    type: 'string',
                    description: 'Branch to checkout',
                },
            },
            required: ['repo_path', 'branch_name'],
        },
    },
    {
        name: 'daytona_git_delete_branch',
        description: 'Delete a branch.',
        input_schema: {
            type: 'object',
            properties: {
                repo_path: {
                    type: 'string',
                    description: 'Repository path',
                },
                branch_name: {
                    type: 'string',
                    description: 'Branch to delete',
                },
            },
            required: ['repo_path', 'branch_name'],
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
        name: 'daytona_get_workspace_metadata',
        description: 'Get workspace metadata including preview_port, custom settings, etc. Useful for debugging when tools seem to fail.',
        input_schema: {
            type: 'object',
            properties: {},
        },
    },
    // PTY Session Management - For Long-Running Processes (Dev Servers)
    {
        name: 'daytona_create_session',
        description: 'Create a PTY session for running long-running processes like dev servers. Use this instead of execute_command with & backgrounding.',
        input_schema: {
            type: 'object',
            properties: {
                session_id: {
                    type: 'string',
                    description: 'Unique identifier for this session (e.g. "dev-server", "build-watch")',
                },
            },
            required: ['session_id'],
        },
    },
    {
        name: 'daytona_session_exec',
        description: 'Execute a command in an existing PTY session. Use this to run dev servers, build watchers, and other long-running processes.',
        input_schema: {
            type: 'object',
            properties: {
                session_id: {
                    type: 'string',
                    description: 'Session ID to execute command in',
                },
                command: {
                    type: 'string',
                    description: 'Command to execute (e.g., "npm run dev", "python app.py")',
                },
            },
            required: ['session_id', 'command'],
        },
    },
    {
        name: 'daytona_get_session',
        description: 'Get status and command history of a PTY session. Use this to check if a dev server is still running.',
        input_schema: {
            type: 'object',
            properties: {
                session_id: {
                    type: 'string',
                    description: 'Session identifier to query',
                },
            },
            required: ['session_id'],
        },
    },
    {
        name: 'daytona_delete_session',
        description: 'Stop and delete a PTY session. Use this to clean up when done with a dev server.',
        input_schema: {
            type: 'object',
            properties: {
                session_id: {
                    type: 'string',
                    description: 'Session identifier to delete',
                },
            },
            required: ['session_id'],
        },
    },
    {
        name: 'daytona_list_sessions',
        description: 'List all active PTY sessions for the workspace.',
        input_schema: {
            type: 'object',
            properties: {},
        },
    },
    {
        name: 'daytona_code_run',
        description: 'Execute code snippet in the Daytona sandbox. Supports Python, JavaScript, Shell scripts, and other languages. Returns stdout, stderr, exit code, and any generated artifacts. Ideal for running short scripts, data processing, or testing code snippets.',
        input_schema: {
            type: 'object',
            properties: {
                code: {
                    type: 'string',
                    description: 'Code to execute in the sandbox',
                },
                argv: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Optional command-line arguments to pass to the code',
                },
                env: {
                    type: 'object',
                    description: 'Optional environment variables as key-value pairs',
                },
            },
            required: ['code'],
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
    {
        name: 'daytona_create_folder',
        description: 'Create a directory/folder in the Daytona sandbox with optional permissions.',
        input_schema: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'Directory path to create (e.g., "workspace/data")',
                },
                permissions: {
                    type: 'string',
                    description: 'Optional permissions (e.g., "755", "700"). Default is "755".',
                },
            },
            required: ['path'],
        },
    },
    {
        name: 'daytona_delete_file',
        description: 'Delete a file or directory from the Daytona sandbox. Use with caution!',
        input_schema: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'File or directory path to delete',
                },
            },
            required: ['path'],
        },
    },
    {
        name: 'daytona_move_file',
        description: 'Move or rename a file/directory in the Daytona sandbox.',
        input_schema: {
            type: 'object',
            properties: {
                source_path: {
                    type: 'string',
                    description: 'Source file or directory path',
                },
                dest_path: {
                    type: 'string',
                    description: 'Destination file or directory path',
                },
            },
            required: ['source_path', 'dest_path'],
        },
    },
    {
        name: 'daytona_set_permissions',
        description: 'Set file or directory permissions (chmod) in the Daytona sandbox.',
        input_schema: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'File or directory path',
                },
                mode: {
                    type: 'string',
                    description: 'Permission mode (e.g., "755", "644", "700")',
                },
            },
            required: ['path', 'mode'],
        },
    },
    {
        name: 'daytona_get_file_info',
        description: 'Get detailed file or directory metadata (size, permissions, owner, etc.).',
        input_schema: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'File or directory path',
                },
            },
            required: ['path'],
        },
    },
    {
        name: 'daytona_find_files',
        description: 'Search for files by name pattern in a directory (recursive).',
        input_schema: {
            type: 'object',
            properties: {
                directory: {
                    type: 'string',
                    description: 'Directory to search in',
                },
                pattern: {
                    type: 'string',
                    description: 'File name pattern (e.g., "*.py", "test_*", "README.md")',
                },
            },
            required: ['directory', 'pattern'],
        },
    },
    {
        name: 'daytona_replace_in_files',
        description: 'Find and replace text across multiple files in a directory. Powerful bulk editing tool.',
        input_schema: {
            type: 'object',
            properties: {
                directory: {
                    type: 'string',
                    description: 'Directory to search in',
                },
                find: {
                    type: 'string',
                    description: 'Text to find',
                },
                replace: {
                    type: 'string',
                    description: 'Text to replace with',
                },
                file_pattern: {
                    type: 'string',
                    description: 'Optional file pattern to limit search (e.g., "*.ts", "*.py")',
                },
            },
            required: ['directory', 'find', 'replace'],
        },
    },
    {
        name: 'daytona_search_files',
        description: 'Search for files using glob patterns (e.g., "**/*.test.ts").',
        input_schema: {
            type: 'object',
            properties: {
                directory: {
                    type: 'string',
                    description: 'Directory to search in',
                },
                glob_pattern: {
                    type: 'string',
                    description: 'Glob pattern (e.g., "**/*.ts", "**/test_*.py", "src/**/*.jsx")',
                },
            },
            required: ['directory', 'glob_pattern'],
        },
    },
];
