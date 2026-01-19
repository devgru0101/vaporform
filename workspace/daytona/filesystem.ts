
import { DaytonaContext } from './types.js';
import { ValidationError } from '../../shared/errors.js';

export class DaytonaFilesystem {
    constructor(private context: DaytonaContext) { }

    /**
     * Write file to workspace
     */
    async writeFile(
        workspaceId: bigint,
        path: string,
        content: string
    ): Promise<void> {
        const workspace = await this.context.getWorkspace(workspaceId);

        if (workspace.status !== 'running') {
            throw new ValidationError('Workspace is not running');
        }

        try {
            if (this.context.daytona && workspace.daytona_sandbox_id) {
                const sandbox = await this.context.getSandbox(workspace) as any;

                const relativePath = path.startsWith('/') ? path.substring(1) : path;
                const fileSize = Buffer.byteLength(content, 'utf-8');

                if (sandbox.fs && sandbox.fs.uploadFile) {
                    const LARGE_FILE_THRESHOLD = 1024 * 1024; // 1MB

                    if (fileSize > LARGE_FILE_THRESHOLD) {
                        console.log(`[DAYTONA] Large file detected (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);
                    }

                    await sandbox.fs.uploadFile(Buffer.from(content, 'utf-8'), relativePath);
                } else {
                    const fs = sandbox.filesystem || sandbox.fs;
                    if (fs && typeof fs.uploadFile === 'function') {
                        await fs.uploadFile(Buffer.from(content, 'utf-8'), relativePath);
                    } else {
                        // Fallback to shell
                        const dir = relativePath.substring(0, relativePath.lastIndexOf('/'));
                        if (dir) {
                            await sandbox.process.executeCommand(`mkdir -p "${dir}"`);
                        }

                        const escapedContent = content.replace(/'/g, "'\\''");
                        const writeCommand = `cat > "${relativePath}" << 'VAPORFORM_EOF'\n${escapedContent}\nVAPORFORM_EOF`;

                        const result = await sandbox.process.executeCommand(writeCommand);
                        const response = result as any;
                        const exitCode = response.exitCode ?? response.code ?? 0;

                        if (exitCode !== 0) {
                            throw new Error(`Write failed (exit ${exitCode}): ${response.stderr || response.error || JSON.stringify(response)}`);
                        }
                    }
                }
            }
        } catch (error) {
            console.error(`Error writing file in workspace ${workspaceId}:`, error);
            throw error;
        }
    }

    /**
     * Read file from workspace
     */
    async readFile(workspaceId: bigint, path: string): Promise<string> {
        const workspace = await this.context.getWorkspace(workspaceId);

        if (workspace.status !== 'running') {
            throw new ValidationError('Workspace is not running');
        }

        try {
            if (this.context.daytona && workspace.daytona_sandbox_id) {
                const sandbox = await this.context.getSandbox(workspace) as any;

                // Use executeCommand to read file (filesystem API not available)
                const relativePath = path.startsWith('/') ? path.substring(1) : path;
                const readCommand = `cat "${relativePath}"`;

                const result = await sandbox.process.executeCommand(readCommand);
                const response = result as any;
                const exitCode = response.exitCode ?? response.code ?? 0;

                if (exitCode !== 0) {
                    // CRITICAL: Return informative message instead of throwing error
                    // This allows agent to continue and create the file instead of stopping
                    const errorMsg = response.stderr || response.error || 'File not found';
                    console.log(`[Daytona] File ${path} not found in sandbox (exit code ${exitCode}): ${errorMsg}`);

                    return `FILE_NOT_FOUND: ${path}

This file does not exist in the Daytona sandbox yet.

Possible actions:
1. Create this file using daytona_write_file tool
2. Check if the file path is correct
3. Verify the file was successfully written earlier

Error details: ${errorMsg}`;
                }

                return response.result || response.stdout || '';
            } else {
                throw new Error('Daytona SDK not available');
            }
        } catch (error) {
            console.error(`Error reading file in workspace ${workspaceId}:`, error);
            throw error;
        }
    }

    // ========================================
    // Advanced Filesystem Operations
    // ========================================

    /**
     * Create a folder/directory
     */
    async createFolder(workspaceId: bigint, remotePath: string, permissions?: string): Promise<void> {
        const workspace = await this.context.getWorkspace(workspaceId);
        if (!this.context.daytona || !workspace.daytona_sandbox_id) {
            throw new ValidationError('Workspace not running');
        }

        const sandbox = await this.context.getSandbox(workspace) as any;
        const relativePath = remotePath.startsWith('/') ? remotePath.substring(1) : remotePath;

        if (sandbox.fs && sandbox.fs.createFolder) {
            await sandbox.fs.createFolder(relativePath, permissions || '755');
        } else {
            // Fallback to shell
            const mode = permissions || '755';
            await sandbox.process.executeCommand(`mkdir -p -m ${mode} "${relativePath}"`);
        }

        await this.context.addLog(workspaceId, 'info', `Created folder: ${relativePath}`);
    }

    /**
     * Delete a file or folder
     */
    async deleteFile(workspaceId: bigint, remotePath: string): Promise<void> {
        const workspace = await this.context.getWorkspace(workspaceId);
        if (!this.context.daytona || !workspace.daytona_sandbox_id) {
            throw new ValidationError('Workspace not running');
        }

        const sandbox = await this.context.getSandbox(workspace) as any;
        const relativePath = remotePath.startsWith('/') ? remotePath.substring(1) : remotePath;

        if (sandbox.fs && sandbox.fs.deleteFile) {
            await sandbox.fs.deleteFile(relativePath);
        } else {
            // Fallback to shell
            await sandbox.process.executeCommand(`rm -rf "${relativePath}"`);
        }

        await this.context.addLog(workspaceId, 'info', `Deleted: ${relativePath}`);
    }

    /**
     * Move or rename a file
     */
    async moveFile(workspaceId: bigint, sourcePath: string, destPath: string): Promise<void> {
        const workspace = await this.context.getWorkspace(workspaceId);
        if (!this.context.daytona || !workspace.daytona_sandbox_id) {
            throw new ValidationError('Workspace not running');
        }

        const sandbox = await this.context.getSandbox(workspace) as any;
        const relativeSource = sourcePath.startsWith('/') ? sourcePath.substring(1) : sourcePath;
        const relativeDest = destPath.startsWith('/') ? destPath.substring(1) : destPath;

        if (sandbox.fs && sandbox.fs.moveFiles) {
            await sandbox.fs.moveFiles({ [relativeSource]: relativeDest });
        } else {
            // Fallback to shell
            await sandbox.process.executeCommand(`mv "${relativeSource}" "${relativeDest}"`);
        }

        await this.context.addLog(workspaceId, 'info', `Moved: ${relativeSource} → ${relativeDest}`);
    }

    /**
     * Set file permissions (chmod)
     */
    async setPermissions(workspaceId: bigint, remotePath: string, mode: string): Promise<void> {
        const workspace = await this.context.getWorkspace(workspaceId);
        if (!this.context.daytona || !workspace.daytona_sandbox_id) {
            throw new ValidationError('Workspace not running');
        }

        const sandbox = await this.context.getSandbox(workspace) as any;
        const relativePath = remotePath.startsWith('/') ? remotePath.substring(1) : remotePath;

        if (sandbox.fs && sandbox.fs.setFilePermissions) {
            await sandbox.fs.setFilePermissions(relativePath, { mode });
        } else {
            // Fallback to shell
            await sandbox.process.executeCommand(`chmod ${mode} "${relativePath}"`);
        }

        await this.context.addLog(workspaceId, 'info', `Set permissions ${mode} on: ${relativePath}`);
    }

    /**
     * Get file information/metadata
     */
    async getFileInfo(workspaceId: bigint, remotePath: string): Promise<any> {
        const workspace = await this.context.getWorkspace(workspaceId);
        if (!this.context.daytona || !workspace.daytona_sandbox_id) {
            throw new ValidationError('Workspace not running');
        }

        const sandbox = await this.context.getSandbox(workspace) as any;
        const relativePath = remotePath.startsWith('/') ? remotePath.substring(1) : remotePath;

        if (sandbox.fs && sandbox.fs.getFileDetails) {
            return await sandbox.fs.getFileDetails(relativePath);
        } else {
            // Fallback to shell - get detailed file info
            const result = await sandbox.process.executeCommand(`stat -c '%n|%s|%a|%U|%G|%Y|%F' "${relativePath}" 2>/dev/null || stat -f '%N|%z|%Lp|%Su|%Sg|%m|%HT' "${relativePath}"`);
            const output = result.stdout || result.result || '';
            const parts = output.trim().split('|');

            if (parts.length >= 6) {
                return {
                    path: parts[0],
                    size: parseInt(parts[1]) || 0,
                    permissions: parts[2],
                    owner: parts[3],
                    group: parts[4],
                    modified: parseInt(parts[5]) || 0,
                    type: parts[6] || 'unknown'
                };
            }

            return { path: relativePath, error: 'Could not parse file info' };
        }
    }

    /**
     * Find files by pattern
     */
    async findFiles(workspaceId: bigint, directory: string, pattern: string): Promise<string[]> {
        const workspace = await this.context.getWorkspace(workspaceId);
        if (!this.context.daytona || !workspace.daytona_sandbox_id) {
            throw new ValidationError('Workspace not running');
        }

        const sandbox = await this.context.getSandbox(workspace) as any;
        const relativeDir = directory.startsWith('/') ? directory.substring(1) : directory;

        if (sandbox.fs && sandbox.fs.findFiles) {
            const results = await sandbox.fs.findFiles(relativeDir, pattern);
            return Array.isArray(results) ? results : [];
        } else {
            // Fallback to shell - find by pattern
            const result = await sandbox.process.executeCommand(`find "${relativeDir}" -name "${pattern}" 2>/dev/null || true`);
            const output = result.stdout || result.result || '';
            return output.trim().split('\n').filter((line: string) => line.length > 0);
        }
    }

    /**
     * Replace text in files
     */
    async replaceInFiles(
        workspaceId: bigint,
        directory: string,
        find: string,
        replace: string,
        filePattern?: string
    ): Promise<any> {
        const workspace = await this.context.getWorkspace(workspaceId);
        if (!this.context.daytona || !workspace.daytona_sandbox_id) {
            throw new ValidationError('Workspace not running');
        }

        const sandbox = await this.context.getSandbox(workspace) as any;
        const relativeDir = directory.startsWith('/') ? directory.substring(1) : directory;

        if (sandbox.fs && sandbox.fs.replaceInFiles) {
            return await sandbox.fs.replaceInFiles(relativeDir, find, replace, filePattern);
        } else {
            // Fallback to shell - use sed for find/replace
            const pattern = filePattern || '*';
            const escapedFind = find.replace(/\//g, '\\/').replace(/"/g, '\\"');
            const escapedReplace = replace.replace(/\//g, '\\/').replace(/"/g, '\\"');
            const cmd = `find "${relativeDir}" -name "${pattern}" -type f -exec sed -i 's/${escapedFind}/${escapedReplace}/g' {} + 2>/dev/null || true`;

            const result = await sandbox.process.executeCommand(cmd);
            await this.context.addLog(workspaceId, 'info', `Replaced "${find}" with "${replace}" in ${relativeDir}`);

            return {
                directory: relativeDir,
                find,
                replace,
                pattern: filePattern,
                message: 'Replacement completed'
            };
        }
    }

    /**
     * Search files by glob pattern
     */
    async searchFiles(workspaceId: bigint, directory: string, globPattern: string): Promise<string[]> {
        const workspace = await this.context.getWorkspace(workspaceId);
        if (!this.context.daytona || !workspace.daytona_sandbox_id) {
            throw new ValidationError('Workspace not running');
        }

        const sandbox = await this.context.getSandbox(workspace) as any;
        const relativeDir = directory.startsWith('/') ? directory.substring(1) : directory;

        if (sandbox.fs && sandbox.fs.searchFiles) {
            const results = await sandbox.fs.searchFiles(relativeDir, globPattern);
            return Array.isArray(results) ? results.map((r: any) => r.path || r) : [];
        } else {
            // Fallback to shell - use find with glob pattern
            const result = await sandbox.process.executeCommand(`find "${relativeDir}" -path "${globPattern}" 2>/dev/null || true`);
            const output = result.stdout || result.result || '';
            return output.trim().split('\n').filter((line: string) => line.length > 0);
        }
    }
}
