

import { daytonaManager } from '../workspace/daytona-manager.js';
import { gridfs } from '../vfs/gridfs.js';
import { logToolExecution, updateJobProgress, indexFileForRAG } from './tool-utils.js';
import { getMimeType } from '../shared/utils.js';
import { db } from './db.js'; // For querying agent_jobs

export async function handleWriteFile(
    input: { path: string; content: string; line_count?: number },
    workspaceId: bigint,
    projectId: bigint,
    jobId: bigint
): Promise<any> {
    const { path, content, line_count } = input;

    if (line_count !== undefined) {
        const actualLines = content.split('\n').length;
        if (actualLines !== line_count) {
            console.warn(`Line count mismatch: expected ${line_count}, got ${actualLines}`);
        }
    }

    await daytonaManager.writeFile(workspaceId, path, content);
    console.log(`[Tool Handler] ✓ Wrote file to Daytona sandbox: ${path} (${content.length} bytes)`);

    const metadata = await gridfs.writeFile(
        projectId,
        path,
        Buffer.from(content, 'utf-8'),
        getMimeType(path)
    );

    console.log(`[Tool Handler] ✓ Backed up file to VFS: ${path}`);

    await updateJobProgress(jobId, `Created ${path}`);
    await indexFileForRAG(projectId, path, content, jobId);

    return {
        success: true,
        path,
        bytes: content.length,
        lines: content.split('\n').length,
        vfs_file_id: metadata.gridfs_file_id,
        daytona_written: true
    };
}

export async function handleReadFile(
    input: { path: string; line_range?: { start: number; end: number } },
    workspaceId: bigint,
    projectId: bigint,
    jobId: bigint
): Promise<any> {
    const { path, line_range } = input;
    let content: string;
    let source: string;

    try {
        content = await daytonaManager.readFile(workspaceId, path);
        source = 'daytona';
        console.log(`[Tool Handler] Read file from Daytona sandbox: ${path}`);
    } catch (daytonaError) {
        console.log(`[Tool Handler] File not in Daytona, reading from VFS: ${path}`);
        try {
            const buffer = await gridfs.readFile(projectId, path);
            content = buffer.toString('utf-8');
            source = 'vfs';
        } catch (vfsError) {
            throw new Error(`File not found in Daytona or VFS: ${path}`);
        }
    }

    if (line_range) {
        const lines = content.split('\n');
        const selectedLines = lines.slice(line_range.start - 1, line_range.end);
        return {
            path,
            content: selectedLines.join('\n'),
            line_range,
            source
        };
    }

    return {
        path,
        content,
        source
    };
}

export async function handleEditFile(
    input: { path: string; old_text: string; new_text: string },
    workspaceId: bigint,
    projectId: bigint,
    jobId: bigint
): Promise<any> {
    const { path, old_text, new_text } = input;
    await logToolExecution(jobId, 'edit_file', 'info', `Editing file: ${path}`);

    try {
        const buffer = await gridfs.readFile(projectId, path);
        const content = buffer.toString('utf-8');

        if (!content.includes(old_text)) {
            return {
                success: false,
                error: `Text not found in file: "${old_text.substring(0, 100)}${old_text.length > 100 ? '...' : ''}"`,
                message: 'The old_text was not found in the file. Make sure it matches exactly including whitespace.'
            };
        }

        const newContent = content.replace(old_text, new_text);

        // Write to both Daytona and VFS
        await daytonaManager.writeFile(workspaceId, path, newContent);
        await gridfs.writeFile(projectId, path, Buffer.from(newContent), 'text/plain');

        await logToolExecution(jobId, 'edit_file', 'info', `Successfully edited ${path}`);

        return {
            success: true,
            path,
            changes: {
                removed: old_text.split('\n').length,
                added: new_text.split('\n').length
            },
            message: `Successfully edited ${path}`
        };
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        await logToolExecution(jobId, 'edit_file', 'error', `Failed to edit file: ${errorMsg}`);
        return { success: false, error: errorMsg, path };
    }
}

export async function handleListFiles(
    input: { path?: string; recursive?: boolean },
    workspaceId: bigint,
    projectId: bigint, // Added projectId for VFS fallback
    jobId: bigint
): Promise<any> {
    const { path = '.', recursive = false } = input;

    // 1. Try listing from Daytona first (if running)
    try {
        const errorToken = "__CMD_ERROR__";
        // Use a unique error token to avoid matching the echoed command itself
        const command = recursive
            ? `find ${path} -type f 2>/dev/null || echo "${errorToken}: Directory not found"`
            : `ls -la ${path} 2>/dev/null || echo "${errorToken}: Directory not found"`;

        const result = await daytonaManager.executeCommand(workspaceId, command);

        // Check for specific error token, or if output indicates DEV mode (simulation)
        if (result.stdout.includes(errorToken)) {
            throw new Error(`Failed to list files in ${path}: Directory not found`);
        }



        return {
            path,
            files: result.stdout.split('\n').filter(f => f.trim()),
            source: 'daytona'
        };
    } catch (daytonaError) {
        // 2. Fallback to VFS (GridFS)
        console.log(`[Tool Handler] Failed to list files from Daytona (${daytonaError instanceof Error ? daytonaError.message : String(daytonaError)}), falling back to VFS`);

        try {
            if (recursive) {
                // GridFS doesn't support recursive list easily in one go efficiently without aggregating
                // For now, we'll just list the top level dir or warn
                // Actually, let's just list the requested directory non-recursively for VFS fallback
                // or implement a recursive walker if critical. For now, flat list is safer.
                console.warn('[Tool Handler] Recursive list not fully supported in VFS fallback, returning flat list of directory');
            }

            const files = await gridfs.listDirectory(projectId, path);
            // Map Metadata to simple string list (or handled structured if needed, but tool expects strings mostly)
            // The tool interface usually expects string paths.
            // GridFS listDirectory returns metadata. We should return filenames or paths.
            // If recursive was requested, we might want full paths.

            const fileList = files.map(f => f.is_directory ? `${f.filename}/` : f.filename);

            return {
                path,
                files: fileList,
                source: 'vfs_fallback'
            };
        } catch (vfsError) {
            throw new Error(`Failed to list files in ${path} (checked Daytona and VFS): ${vfsError instanceof Error ? vfsError.message : 'Unknown error'}`);
        }
    }
}

export async function handleSearchFiles(
    input: { pattern: string; path?: string },
    workspaceId: bigint,
    jobId: bigint
): Promise<any> {
    const { pattern, path = '.' } = input;
    const command = `find ${path} -name "${pattern}"`;
    const result = await daytonaManager.executeCommand(workspaceId, command);

    return {
        pattern,
        matches: result.stdout.split('\n').filter(f => f.trim())
    };
}

export async function handleDaytonaReadFile(
    input: { path: string },
    workspaceId: bigint,
    jobId: bigint
): Promise<any> {
    const { path } = input;
    console.log(`[Daytona Tool] Reading file from sandbox: ${path}`);
    try {
        const content = await daytonaManager.readFile(workspaceId, path);
        return { success: true, path, content, source: 'daytona_sandbox' };
    } catch (error) {
        throw new Error(`Failed to read file ${path} from Daytona sandbox: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

export async function handleDaytonaWriteFile(
    input: { path: string; content: string },
    workspaceId: bigint,
    jobId: bigint
): Promise<any> {
    const { path, content } = input;
    console.log(`[Daytona Tool] Writing file to sandbox: ${path} (${content.length} bytes)`);
    try {
        // 1. Write to Daytona sandbox (fast)
        await daytonaManager.writeFile(workspaceId, path, content);
        await updateJobProgress(jobId, `Wrote ${path} to sandbox`);

        // 2. CRITICAL: Also write to local Git repo so file explorer can see it
        // Get project ID from workspace table (which is in workspace database, not ai database!)
        const { db: workspaceDb } = await import('../workspace/workspace-db.js');
        const workspace = await workspaceDb.queryRow<{ project_id: bigint }>`
          SELECT project_id FROM workspaces WHERE id = ${workspaceId}
        `;


        if (workspace?.project_id) {
            const { createGitManager } = await import('../git/git-manager.js');
            const { tmpdir } = await import('os');
            const { join } = await import('path');
            const { writeFileSync, mkdirSync, existsSync } = await import('fs');

            try {
                const gitRepoPath = join(tmpdir(), `vaporform-git-${workspace.project_id}`);

                // Create Git repo directory if it doesn't exist
                if (!existsSync(gitRepoPath)) {
                    console.log(`[Git] Initializing Git repo for project ${workspace.project_id}`);
                    mkdirSync(gitRepoPath, { recursive: true });
                    const gitManager = createGitManager(workspace.project_id);
                    await gitManager.init(workspace.project_id);
                }

                // Write file to Git repo
                const fullPath = join(gitRepoPath, path);
                const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
                if (dir && !existsSync(dir)) {
                    mkdirSync(dir, { recursive: true });
                }
                writeFileSync(fullPath, content);

                // Commit to Git
                const gitManager = createGitManager(workspace.project_id);
                await gitManager.commit(
                    workspace.project_id,
                    `Add/update ${path}`,
                    'Agent',
                    'agent@vaporform.dev',
                    [path]
                );

                console.log(`[Git] Committed ${path} to local Git repo`);
            } catch (gitError) {
                console.error(`[Git] Failed to commit to Git (non-fatal):`, gitError);
                // Don't fail the whole operation if Git commit fails
            }
        }

        return { success: true, path, bytes: content.length, lines: content.split('\n').length, destination: 'daytona_sandbox_and_git' };
    } catch (error) {
        throw new Error(`Failed to write file ${path} to Daytona sandbox: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

export async function handleDaytonaListFiles(
    input: { path?: string; recursive?: boolean },
    workspaceId: bigint,
    jobId: bigint
): Promise<any> {
    const { path = '.', recursive = false } = input;
    console.log(`[Daytona Tool] Listing files in sandbox: ${path} (recursive: ${recursive})`);
    const command = recursive
        ? `find ${path} -type f 2>/dev/null || echo "__CMD_ERROR__: Directory not found"`
        : `ls -la ${path} 2>/dev/null || echo "__CMD_ERROR__: Directory not found"`;

    try {
        const result = await daytonaManager.executeCommand(workspaceId, command);

        // CRITICAL: Return informative message instead of throwing error
        // Check for specific error token
        if (result.stdout.includes('__CMD_ERROR__')) {
            console.log(`[Daytona] Directory not found: ${path}`);
            return {
                success: true, // Don't stop agent
                path,
                recursive,
                files: [],
                count: 0,
                error: `DIRECTORY_NOT_FOUND: ${path}`,
                message: `Directory "${path}" does not exist in the Daytona sandbox yet.\n\nPossible actions:\n1. Create files in this directory using daytona_write_file\n2. Verify the directory path is correct\n3. Note this for your todo list to investigate further\n\nThe directory may need to be created before you can list its contents.`
            };
        }

        if (result.stderr) {
            console.log(`[Daytona] Error listing ${path}: ${result.stderr}`);
            return {
                success: true, // Don't stop agent
                path,
                recursive,
                files: [],
                count: 0,
                error: `DIRECTORY_ERROR: ${path}`,
                message: `Error accessing directory "${path}": ${result.stderr}\n\nYou may need to create this directory or check the path is correct.`
            };
        }

        const files = result.stdout.split('\n').filter(f => f.trim());
        return { success: true, path, recursive, files, count: files.length };
    } catch (error: any) {
        // Even on exceptions, return info instead of throwing
        console.error('[Daytona] Exception listing directory:', error);
        return {
            success: true, // Don't stop agent
            path,
            recursive,
            files: [],
            count: 0,
            error: 'DIRECTORY_ACCESS_ERROR',
            message: `Exception accessing directory "${path}": ${error.message}\n\nNote this in your todo list and try creating the directory or checking the path.`
        };
    }
}

export async function handleDeleteFile(
    input: { path: string; recursive?: boolean },
    workspaceId: bigint,
    projectId: bigint,
    jobId: bigint
): Promise<any> {
    const { path, recursive = false } = input;
    await logToolExecution(jobId, 'delete_file', 'info', `Deleting ${path} (recursive: ${recursive})`);

    const result: any = { path, daytona_deleted: false, vfs_deleted: false, message: '' };
    const errors: string[] = [];

    // 1. Delete from Daytona Sandbox
    try {
        // Use 'rm -rf' for recursive, or 'rm' for file. 
        // Actually 'rm -rf' works for files too and is safer for automated tools regarding prompts.
        // But we should be careful. 
        // If recursive is false, we should use 'rm' (or 'rmdir' for empty dir). 
        // Let's stick to 'rm -rf' if recursive is true, and simple 'rm' if false (which will fail on dir).

        let command = `rm "${path}"`;
        if (recursive) {
            command = `rm -rf "${path}"`;
        }

        const cmdResult = await daytonaManager.executeCommand(workspaceId, command);
        if (cmdResult.exitCode === 0) {
            result.daytona_deleted = true;
            console.log(`[Tool Handler] Deleted from Daytona: ${path}`);
        } else {
            // If it failed, it might not exist or be a permission issue
            if (cmdResult.stderr.includes('No such file')) {
                result.daytona_status = 'not_found';
            } else {
                errors.push(`Daytona: ${cmdResult.stderr}`);
            }
        }
    } catch (err) {
        console.warn(`[Tool Handler] Failed to delete from Daytona:`, err);
        errors.push(`Daytona Error: ${err instanceof Error ? err.message : String(err)}`);
    }

    // 2. Delete from VFS
    try {
        await gridfs.delete(projectId, path, recursive);
        result.vfs_deleted = true;
        console.log(`[Tool Handler] Deleted from VFS: ${path}`);
    } catch (err: any) {
        if (err.message && err.message.includes('not found')) {
            result.vfs_status = 'not_found';
        } else {
            console.warn(`[Tool Handler] Failed to delete from VFS:`, err);
            errors.push(`VFS Error: ${err.message || String(err)}`);
        }
    }

    // Check overall success
    // Success if deleted from at least one, or if "not found" in both (idempotent)
    const daytonaGone = result.daytona_deleted || result.daytona_status === 'not_found';
    const vfsGone = result.vfs_deleted || result.vfs_status === 'not_found';

    if (daytonaGone && vfsGone) {
        await updateJobProgress(jobId, `Deleted ${path}`);
        return { success: true, ...result };
    } else {
        return {
            success: false,
            ...result,
            error: errors.join('; ') || 'Failed to delete from one or more targets'
        };
    }
}
