/**
 * Terminal Agent Tools
 * OpenCode-style tools for terminal agent with workspace awareness
 */

import type { Anthropic } from '@anthropic-ai/sdk';
import { gridfs } from '../vfs/gridfs.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import { contextManager } from './context-manager.js';

const execAsync = promisify(exec);

// ============================================================================
// Tool Context
// ============================================================================

interface ToolContext {
  projectId: bigint;
  sessionId: bigint;
  workspaceId?: bigint;
  userId: string;
}

// ============================================================================
// Terminal Agent Tools Class
// ============================================================================

class TerminalAgentTools {
  /**
   * Get tool definitions for Claude
   */
  getToolDefinitions(): Anthropic.Tool[] {
    return [
      {
        name: 'bash',
        description: 'Execute a bash command in the workspace. Use this for running commands, checking status, installing packages, etc. Returns stdout, stderr, and exit code.',
        input_schema: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              description: 'The bash command to execute'
            },
            timeout: {
              type: 'number',
              description: 'Command timeout in milliseconds (default: 30000)',
              default: 30000
            }
          },
          required: ['command']
        }
      },
      {
        name: 'read_file',
        description: 'Read the contents of a file from the project VFS. Returns the file content as a string.',
        input_schema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Absolute path to the file (e.g., /src/index.ts)'
            }
          },
          required: ['path']
        }
      },
      {
        name: 'write_file',
        description: 'Write content to a file in the project VFS. Creates parent directories if needed. Overwrites existing files.',
        input_schema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Absolute path to the file'
            },
            content: {
              type: 'string',
              description: 'Content to write to the file'
            }
          },
          required: ['path', 'content']
        }
      },
      {
        name: 'edit_file',
        description: 'Make a targeted edit to a file by replacing old_text with new_text. More precise than write_file for small changes.',
        input_schema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Absolute path to the file'
            },
            old_text: {
              type: 'string',
              description: 'Text to find and replace (must match exactly)'
            },
            new_text: {
              type: 'string',
              description: 'Text to replace with'
            }
          },
          required: ['path', 'old_text', 'new_text']
        }
      },
      {
        name: 'glob',
        description: 'Find files matching a glob pattern. Returns list of matching file paths.',
        input_schema: {
          type: 'object',
          properties: {
            pattern: {
              type: 'string',
              description: 'Glob pattern (e.g., "**/*.ts", "src/**/*.js")'
            },
            max_results: {
              type: 'number',
              description: 'Maximum number of results to return (default: 100)',
              default: 100
            }
          },
          required: ['pattern']
        }
      },
      {
        name: 'grep',
        description: 'Search for a pattern in files. Returns matching lines with file paths and line numbers.',
        input_schema: {
          type: 'object',
          properties: {
            pattern: {
              type: 'string',
              description: 'Text or regex pattern to search for'
            },
            path: {
              type: 'string',
              description: 'Directory or file to search in (default: /)',
              default: '/'
            },
            file_pattern: {
              type: 'string',
              description: 'Glob pattern to filter files (e.g., "*.ts")'
            },
            case_insensitive: {
              type: 'boolean',
              description: 'Case-insensitive search',
              default: false
            },
            max_results: {
              type: 'number',
              description: 'Maximum number of results (default: 50)',
              default: 50
            }
          },
          required: ['pattern']
        }
      },
      {
        name: 'ls',
        description: 'List files and directories in a path. Returns file metadata including size, type, and modification time.',
        input_schema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Directory path to list (default: /)',
              default: '/'
            }
          }
        }
      },
      {
        name: 'build_status',
        description: 'Get the status of the latest build or a specific build. Shows build phase, progress, logs, and errors.',
        input_schema: {
          type: 'object',
          properties: {
            build_id: {
              type: 'string',
              description: 'Specific build ID to check (optional - defaults to latest)'
            },
            show_logs: {
              type: 'boolean',
              description: 'Include full build logs in response',
              default: false
            }
          }
        }
      },
      {
        name: 'start_build',
        description: 'Start a new build with comprehensive tracking. Returns build ID and initial status.',
        input_schema: {
          type: 'object',
          properties: {
            metadata: {
              type: 'object',
              description: 'Optional metadata for the build'
            }
          }
        }
      },
      {
        name: 'check_process',
        description: 'Check if a specific process or port is running in the workspace. Useful for checking dev servers.',
        input_schema: {
          type: 'object',
          properties: {
            port: {
              type: 'number',
              description: 'Port number to check (e.g., 3000 for Next.js)'
            },
            process_name: {
              type: 'string',
              description: 'Process name to search for (e.g., "npm", "node")'
            }
          }
        }
      },
      {
        name: 'get_preview_url',
        description: 'Get the preview URL for the running application. Automatically detects the correct port.',
        input_schema: {
          type: 'object',
          properties: {
            port: {
              type: 'number',
              description: 'Specific port to get preview URL for (optional - auto-detects if not provided)'
            }
          }
        }
      },
      {
        name: 'run_code',
        description: 'Execute code in the workspace runtime. Supports Python, TypeScript, and JavaScript. Returns stdout, stderr, exit code, and matplotlib chart artifacts. Use for testing code snippets.',
        input_schema: {
          type: 'object',
          properties: {
            code: {
              type: 'string',
              description: 'Code to execute'
            },
            language: {
              type: 'string',
              enum: ['python', 'typescript', 'javascript'],
              description: 'Programming language'
            },
            timeout: {
              type: 'number',
              description: 'Timeout in seconds (default: 30)',
              default: 30
            }
          },
          required: ['code', 'language']
        }
      },
      {
        name: 'list_pty_sessions',
        description: 'List all active PTY (terminal) sessions in the workspace. Shows session IDs, active status, working directory, and terminal dimensions.',
        input_schema: {
          type: 'object',
          properties: {}
        }
      }
    ];
  }

  /**
   * Execute a tool by name
   */
  async executeTool(
    toolName: string,
    input: any,
    context: ToolContext
  ): Promise<any> {
    console.log(`[Terminal Tool] Executing ${toolName} with input:`, input);

    switch (toolName) {
      case 'bash':
        return await this.handleBash(input, context);
      case 'read_file':
        return await this.handleReadFile(input, context);
      case 'write_file':
        return await this.handleWriteFile(input, context);
      case 'edit_file':
        return await this.handleEditFile(input, context);
      case 'glob':
        return await this.handleGlob(input, context);
      case 'grep':
        return await this.handleGrep(input, context);
      case 'ls':
        return await this.handleLs(input, context);
      case 'build_status':
        return await this.handleBuildStatus(input, context);
      case 'start_build':
        return await this.handleStartBuild(input, context);
      case 'check_process':
        return await this.handleCheckProcess(input, context);
      case 'get_preview_url':
        return await this.handleGetPreviewUrl(input, context);
      case 'run_code':
        return await this.handleCodeRun(input, context);
      case 'list_pty_sessions':
        return await this.handleListPtySessions(input, context);
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  /**
   * Execute bash command
   */
  private async handleBash(
    input: { command: string; timeout?: number },
    context: ToolContext
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const timeout = input.timeout || 30000;

    try {
      // If workspace is configured, execute in Daytona sandbox
      if (context.workspaceId) {
        return await this.executeBashInWorkspace(input.command, context.workspaceId, timeout);
      }

      // Otherwise execute locally (for testing/development)
      const { stdout, stderr } = await execAsync(input.command, {
        timeout,
        maxBuffer: 1024 * 1024 * 10 // 10MB buffer
      });

      return {
        stdout: stdout.toString(),
        stderr: stderr.toString(),
        exitCode: 0
      };

    } catch (error: any) {
      return {
        stdout: error.stdout?.toString() || '',
        stderr: error.stderr?.toString() || error.message,
        exitCode: error.code || 1
      };
    }
  }

  /**
   * Execute bash command in Daytona workspace
   */
  private async executeBashInWorkspace(
    command: string,
    workspaceId: bigint,
    timeout: number
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const { daytonaManager } = await import('../workspace/daytona-manager.js');
    const workspace = await daytonaManager.getWorkspace(workspaceId);

    if (!workspace.daytona_sandbox_id) {
      throw new Error('Workspace does not have a Daytona sandbox configured');
    }

    const { daytona } = daytonaManager as any;
    if (!daytona) {
      throw new Error('Daytona SDK not initialized');
    }

    const sandbox = await daytona.get(workspace.daytona_sandbox_id);

    // Execute command and collect output
    let stdout = '';
    let stderr = '';
    let exitCode = 0;

    const process = await sandbox.process.start({
      id: `terminal-cmd-${Date.now()}`,
      cmd: ['/bin/sh', '-c', command],
      cwd: '/workspace',
      onStdout: (data: Uint8Array) => {
        stdout += new TextDecoder().decode(data);
      },
      onStderr: (data: Uint8Array) => {
        stderr += new TextDecoder().decode(data);
      }
    });

    // Wait for completion with timeout
    const result = await Promise.race([
      process.wait(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Command timeout')), timeout)
      )
    ]) as any;

    exitCode = result.exitCode || 0;

    return { stdout, stderr, exitCode };
  }

  /**
   * Read file from VFS
   */
  private async handleReadFile(
    input: { path: string },
    context: ToolContext
  ): Promise<{ content: string; size: number }> {
    const buffer = await gridfs.readFile(context.projectId, input.path);
    const content = buffer.toString('utf-8');

    // Track file access in context
    await contextManager.linkContextToSession(
      context.sessionId,
      (await contextManager.upsertContextItem(
        context.projectId,
        'file',
        input.path,
        content.substring(0, 1000), // Store preview
        { fullSize: buffer.length }
      )).id,
      1.0
    );

    return {
      content,
      size: buffer.length
    };
  }

  /**
   * Write file to VFS
   */
  private async handleWriteFile(
    input: { path: string; content: string },
    context: ToolContext
  ): Promise<{ success: boolean; path: string; size: number }> {
    const metadata = await gridfs.writeFile(
      context.projectId,
      input.path,
      input.content
    );

    // Track file modification in context
    await contextManager.upsertContextItem(
      context.projectId,
      'file',
      input.path,
      input.content.substring(0, 1000), // Store preview
      { writtenByTerminalAgent: true, size: Number(metadata.size_bytes) }
    );

    return {
      success: true,
      path: input.path,
      size: Number(metadata.size_bytes)
    };
  }

  /**
   * Edit file with find/replace
   */
  private async handleEditFile(
    input: { path: string; old_text: string; new_text: string },
    context: ToolContext
  ): Promise<{ success: boolean; changes: number }> {
    // Read current content
    const buffer = await gridfs.readFile(context.projectId, input.path);
    const content = buffer.toString('utf-8');

    // Count occurrences
    const occurrences = (content.match(new RegExp(input.old_text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;

    if (occurrences === 0) {
      throw new Error(`Text not found in file: ${input.old_text.substring(0, 50)}...`);
    }

    // Replace all occurrences
    const newContent = content.replace(
      new RegExp(input.old_text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
      input.new_text
    );

    // Write back
    await gridfs.writeFile(context.projectId, input.path, newContent);

    // Track in context
    await contextManager.upsertContextItem(
      context.projectId,
      'file',
      input.path,
      newContent.substring(0, 1000),
      { editedByTerminalAgent: true, changes: occurrences }
    );

    return {
      success: true,
      changes: occurrences
    };
  }

  /**
   * Find files by glob pattern
   */
  private async handleGlob(
    input: { pattern: string; max_results?: number },
    context: ToolContext
  ): Promise<{ files: string[]; total: number }> {
    const maxResults = input.max_results || 100;

    // Get all files from VFS
    const allFiles = await this.getAllFiles(context.projectId, '/');

    // Filter by pattern
    const pattern = input.pattern.startsWith('/') ? input.pattern.slice(1) : input.pattern;
    const matches: string[] = [];

    for (const file of allFiles) {
      const filePath = file.path.startsWith('/') ? file.path.slice(1) : file.path;
      if (this.matchGlob(filePath, pattern)) {
        matches.push(file.path);
        if (matches.length >= maxResults) break;
      }
    }

    return {
      files: matches,
      total: matches.length
    };
  }

  /**
   * Search file contents
   */
  private async handleGrep(
    input: {
      pattern: string;
      path?: string;
      file_pattern?: string;
      case_insensitive?: boolean;
      max_results?: number;
    },
    context: ToolContext
  ): Promise<{ matches: Array<{ file: string; line: number; content: string }>; total: number }> {
    const maxResults = input.max_results || 50;
    const searchPath = input.path || '/';
    const caseInsensitive = input.case_insensitive || false;

    // Get files to search
    let filesToSearch = await this.getAllFiles(context.projectId, searchPath);

    // Filter by file pattern if specified
    if (input.file_pattern) {
      filesToSearch = filesToSearch.filter(file => {
        const fileName = file.path.split('/').pop() || '';
        return this.matchGlob(fileName, input.file_pattern!);
      });
    }

    // Search files
    const matches: Array<{ file: string; line: number; content: string }> = [];
    const regex = new RegExp(input.pattern, caseInsensitive ? 'gi' : 'g');

    for (const file of filesToSearch) {
      if (file.is_directory) continue;

      try {
        const buffer = await gridfs.readFile(context.projectId, file.path);
        const content = buffer.toString('utf-8');
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          if (regex.test(lines[i])) {
            matches.push({
              file: file.path,
              line: i + 1,
              content: lines[i].trim()
            });

            if (matches.length >= maxResults) break;
          }
          regex.lastIndex = 0; // Reset regex
        }

        if (matches.length >= maxResults) break;

      } catch (error) {
        // Skip files that can't be read
        continue;
      }
    }

    return {
      matches,
      total: matches.length
    };
  }

  /**
   * List directory contents
   */
  private async handleLs(
    input: { path?: string },
    context: ToolContext
  ): Promise<{ files: Array<{ name: string; path: string; type: string; size: number }> }> {
    const path = input.path || '/';
    const files = await gridfs.listDirectory(context.projectId, path);

    return {
      files: files.map(file => ({
        name: file.path.split('/').pop() || '',
        path: file.path,
        type: file.is_directory ? 'directory' : 'file',
        size: Number(file.size_bytes)
      }))
    };
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Get all files recursively from VFS
   */
  private async getAllFiles(projectId: bigint, startPath: string): Promise<Array<any>> {
    const allFiles: any[] = [];
    const queue = [startPath];

    while (queue.length > 0) {
      const dirPath = queue.shift()!;
      const files = await gridfs.listDirectory(projectId, dirPath);

      for (const file of files) {
        allFiles.push(file);

        if (file.is_directory) {
          queue.push(file.path);
        }
      }
    }

    return allFiles;
  }

  /**
   * Simple glob pattern matching
   */
  private matchGlob(path: string, pattern: string): boolean {
    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/\*\*/g, '___DOUBLESTAR___')
      .replace(/\*/g, '[^/]*')
      .replace(/___DOUBLESTAR___/g, '.*')
      .replace(/\?/g, '[^/]')
      .replace(/\./g, '\\.');

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(path);
  }

  /**
   * Get build status
   */
  private async handleBuildStatus(
    input: { build_id?: string; show_logs?: boolean },
    context: ToolContext
  ): Promise<any> {
    const { buildManager } = await import('../workspace/build-manager.js');

    // Get latest build if no specific ID provided
    if (!input.build_id) {
      const builds = await buildManager.listBuilds(context.projectId, 1);

      if (builds.length === 0) {
        return {
          found: false,
          message: 'No builds found for this project. Use start_build to create one.'
        };
      }

      const build = builds[0];
      const events = await buildManager.getBuildEvents(build.id, 20);

      return {
        found: true,
        build_id: build.id.toString(),
        status: build.status,
        phase: build.phase,
        current_step: build.current_step,
        progress: `${build.total_steps ? Math.min(100, Math.floor((events.length / build.total_steps) * 100)) : 0}%`,
        duration_ms: build.duration_ms,
        error_message: build.error_message,
        recent_events: events.slice(-10).map(e => `[${e.event_type}] ${e.message}`),
        logs: input.show_logs ? {
          install: build.install_logs?.substring(0, 500),
          build: build.build_logs?.substring(0, 500),
          live: build.live_output?.substring(0, 500)
        } : undefined
      };
    }

    // Get specific build
    const buildId = BigInt(input.build_id);
    const build = await buildManager.getBuild(buildId);
    const events = await buildManager.getBuildEvents(buildId, 50);

    return {
      found: true,
      build_id: build.id.toString(),
      status: build.status,
      phase: build.phase,
      current_step: build.current_step,
      progress: `${build.total_steps ? Math.min(100, Math.floor((events.length / build.total_steps) * 100)) : 0}%`,
      duration_ms: build.duration_ms,
      error_message: build.error_message,
      events: events.map(e => `[${e.event_type}] ${e.phase || 'general'}: ${e.message}`),
      logs: input.show_logs ? {
        install: build.install_logs,
        build: build.build_logs,
        live: build.live_output
      } : undefined
    };
  }

  /**
   * Start a new build
   */
  private async handleStartBuild(
    input: { metadata?: Record<string, any> },
    context: ToolContext
  ): Promise<any> {
    if (!context.workspaceId) {
      throw new Error('No workspace configured. Cannot start build without workspace.');
    }

    const { buildManager } = await import('../workspace/build-manager.js');
    const { startBuildMonitoring } = await import('../workspace/build-stream.js');

    // Create build
    const build = await buildManager.createBuild(context.projectId, context.workspaceId, input.metadata);

    // Start monitoring
    startBuildMonitoring(build.id).catch(err => {
      console.error(`Failed to start build monitoring:`, err);
    });

    // Start build process
    buildManager.startBuild(build.id).catch(err => {
      console.error(`Build ${build.id} failed:`, err);
    });

    return {
      success: true,
      build_id: build.id.toString(),
      status: build.status,
      phase: build.phase,
      message: 'Build started with comprehensive tracking. Use build_status to monitor progress.'
    };
  }

  /**
   * Check process status
   */
  private async handleCheckProcess(
    input: { port?: number; process_name?: string },
    context: ToolContext
  ): Promise<any> {
    if (!context.workspaceId) {
      throw new Error('No workspace configured. Cannot check process status.');
    }

    const { daytonaManager } = await import('../workspace/daytona-manager.js');
    const workspace = await daytonaManager.getWorkspace(context.workspaceId);

    if (workspace.status !== 'running') {
      return {
        workspace_running: false,
        message: `Workspace is ${workspace.status}, not running`
      };
    }

    const results: any = {
      workspace_running: true,
      workspace_status: workspace.status
    };

    // Check port
    if (input.port) {
      const portCheck = await daytonaManager.executeCommand(
        context.workspaceId,
        `lsof -i :${input.port} 2>&1 || netstat -tuln | grep ${input.port} 2>&1 || echo "Not in use"`
      );

      results.port = {
        port: input.port,
        in_use: !portCheck.stdout.includes('Not in use') && portCheck.stdout.trim().length > 10,
        details: portCheck.stdout.substring(0, 200)
      };
    }

    // Check process name
    if (input.process_name) {
      const processCheck = await daytonaManager.executeCommand(
        context.workspaceId,
        `ps aux | grep "${input.process_name}" | grep -v grep || echo "No processes"`
      );

      const processes = processCheck.stdout
        .split('\n')
        .filter(line => line.trim() && !line.includes('No processes'));

      results.process = {
        process_name: input.process_name,
        found: processes.length > 0,
        count: processes.length,
        details: processes.slice(0, 3).join('\n')
      };
    }

    return results;
  }

  /**
   * Get preview URL
   */
  private async handleGetPreviewUrl(
    input: { port?: number },
    context: ToolContext
  ): Promise<any> {
    if (!context.workspaceId) {
      throw new Error('No workspace configured. Cannot get preview URL.');
    }

    const { daytonaManager } = await import('../workspace/daytona-manager.js');

    if (input.port) {
      // Get URL for specific port
      const result = await daytonaManager.getPreviewUrl(context.workspaceId, input.port);

      if (!result) {
        return {
          success: false,
          message: `No preview URL available for port ${input.port}. The server may not be running.`
        };
      }

      return {
        success: true,
        url: result.url,
        port: result.port,
        message: `Preview URL ready for port ${result.port}`
      };
    }

    // Auto-detect port
    const url = await daytonaManager.getSandboxUrl(context.workspaceId);

    if (!url) {
      return {
        success: false,
        message: 'No preview URL available. Try starting a dev server first or specify a port.'
      };
    }

    return {
      success: true,
      url,
      message: 'Preview URL detected automatically'
    };
  }

  /**
   * Execute code in workspace runtime
   * NEW: Complete Daytona Process API coverage
   */
  private async handleCodeRun(
    input: { code: string; language: string; timeout?: number },
    context: ToolContext
  ): Promise<any> {
    if (!context.workspaceId) {
      throw new Error('No workspace configured. Cannot execute code.');
    }

    const { daytonaManager } = await import('../workspace/daytona-manager.js');

    try {
      const result = await daytonaManager.codeRun(
        context.workspaceId,
        input.code,
        undefined,
        input.timeout || 30
      );

      return {
        success: result.exitCode === 0,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        charts: result.artifacts?.charts || [],
        language: input.language
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        exitCode: 1,
        stdout: '',
        stderr: errorMsg,
        error: errorMsg,
        language: input.language
      };
    }
  }

  /**
   * List all PTY sessions
   * NEW: Complete Daytona Process API coverage
   */
  private async handleListPtySessions(
    input: any,
    context: ToolContext
  ): Promise<any> {
    if (!context.workspaceId) {
      throw new Error('No workspace configured. Cannot list PTY sessions.');
    }

    const { daytonaManager } = await import('../workspace/daytona-manager.js');

    try {
      const sessions = await daytonaManager.listDaytonaPtySessions(context.workspaceId);

      return {
        success: true,
        sessions: sessions.map((s: any) => ({
          id: s.id,
          active: s.active,
          cwd: s.cwd,
          cols: s.cols,
          rows: s.rows,
          createdAt: s.createdAt
        })),
        total: sessions.length
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        sessions: [],
        total: 0,
        error: errorMsg
      };
    }
  }
}

// Export singleton
export const terminalAgentTools = new TerminalAgentTools();
