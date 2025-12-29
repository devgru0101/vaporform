
import { createGitManager } from '../git/git-manager.js';
import { db } from '../projects/db.js';
import { logToolExecution, updateJobProgress } from './tool-utils.js';
import { daytonaManager } from '../workspace/daytona-manager.js';

export async function handleGitStatus(
    input: Record<string, never>,
    projectId: bigint,
    jobId: bigint
): Promise<any> {
    await logToolExecution(jobId, 'git_status', 'info', 'Getting git status');

    try {
        const git = createGitManager(projectId);
        await git.syncFromVFS(projectId);
        const status = await (git as any).git.status();

        return {
            success: true,
            modified: status.modified,
            created: status.created,
            deleted: status.deleted,
            not_added: status.not_added,
            conflicted: status.conflicted,
            current_branch: status.current,
            tracking: status.tracking,
            ahead: status.ahead,
            behind: status.behind
        };
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        await logToolExecution(jobId, 'git_status', 'error', `Git status failed: ${errorMsg}`);
        return { success: false, error: errorMsg };
    }
}

export async function handleGitCommit(
    input: { message: string },
    projectId: bigint,
    jobId: bigint
): Promise<any> {
    const { message } = input;
    await logToolExecution(jobId, 'git_commit', 'info', `Creating commit: ${message}`);

    try {
        const git = createGitManager(projectId);
        const commit = await git.commit(projectId, message, 'Vaporform Agent', 'agent@vaporform.dev');
        await logToolExecution(jobId, 'git_commit', 'info', `Created commit: ${commit.commit_hash}`);
        return {
            success: true,
            commit_hash: commit.commit_hash,
            message: commit.message,
            author: commit.author_name,
            files_changed: commit.files_changed,
            timestamp: commit.timestamp
        };
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        await logToolExecution(jobId, 'git_commit', 'error', `Commit failed: ${errorMsg}`);
        return { success: false, error: errorMsg };
    }
}

export async function handleGitLog(
    input: { limit?: number },
    projectId: bigint,
    jobId: bigint
): Promise<any> {
    const { limit = 10 } = input;
    await logToolExecution(jobId, 'git_log', 'info', `Getting last ${limit} commits`);
    try {
        const commits = await db.query<{
            commit_hash: string;
            author_name: string;
            author_email: string;
            message: string;
            timestamp: Date;
            files_changed: number;
        }>`
      SELECT commit_hash, author_name, author_email, message, timestamp, files_changed
      FROM git_commits
      WHERE project_id = ${projectId}
      ORDER BY timestamp DESC
      LIMIT ${limit}
    `;
        const commitList = [];
        for await (const commit of commits) commitList.push(commit);
        return {
            success: true,
            commits: commitList.map(c => ({
                hash: c.commit_hash,
                author: `${c.author_name} <${c.author_email}>`,
                message: c.message,
                timestamp: c.timestamp.toISOString(),
                files_changed: c.files_changed
            })),
            count: commitList.length
        };
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        await logToolExecution(jobId, 'git_log', 'error', `Git log failed: ${errorMsg}`);
        return { success: false, error: errorMsg };
    }
}

export async function handleGitDiff(
    input: { path?: string },
    projectId: bigint,
    jobId: bigint
): Promise<any> {
    const { path } = input;
    await logToolExecution(jobId, 'git_diff', 'info', `Getting diff${path ? ` for ${path}` : ''}`);
    try {
        const git = createGitManager(projectId);
        await git.syncFromVFS(projectId);
        const diff = await (git as any).git.diff(path ? [path] : []);
        return {
            success: true,
            diff,
            path: path || 'all files',
            has_changes: diff.length > 0
        };
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        await logToolExecution(jobId, 'git_diff', 'error', `Git diff failed: ${errorMsg}`);
        return { success: false, error: errorMsg };
    }
}

export async function handleGitUndo(
    input: { steps?: number },
    projectId: bigint,
    jobId: bigint
): Promise<any> {
    const { steps = 1 } = input;
    await logToolExecution(jobId, 'git_undo', 'info', `Undoing last ${steps} commit(s)`);

    try {
        const git = createGitManager(projectId);
        await git.syncFromVFS(projectId);

        // Git reset --hard HEAD~N to undo commits
        const result = await (git as any).git.reset(['--hard', `HEAD~${steps}`]);

        // Sync back to VFS
        await git.syncToVFS(projectId);

        await logToolExecution(jobId, 'git_undo', 'info', `Undid ${steps} commit(s)`);
        return {
            success: true,
            steps_undone: steps,
            message: `Successfully undid ${steps} commit(s)`
        };
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        await logToolExecution(jobId, 'git_undo', 'error', `Undo failed: ${errorMsg}`);
        return { success: false, error: errorMsg };
    }
}

export async function handleGitRedo(
    input: { steps?: number },
    projectId: bigint,
    jobId: bigint
): Promise<any> {
    const { steps = 1 } = input;
    await logToolExecution(jobId, 'git_redo', 'info', `Redoing ${steps} commit(s)`);

    try {
        const git = createGitManager(projectId);
        await git.syncFromVFS(projectId);

        // Git reset --hard HEAD@{N} to redo commits using reflog
        const result = await (git as any).git.reset(['--hard', `HEAD@{${steps}}`]);

        // Sync back to VFS
        await git.syncToVFS(projectId);

        await logToolExecution(jobId, 'git_redo', 'info', `Redid ${steps} commit(s)`);
        return {
            success: true,
            steps_redone: steps,
            message: `Successfully redid ${steps} commit(s)`
        };
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        await logToolExecution(jobId, 'git_redo', 'error', `Redo failed: ${errorMsg}`);
        return { success: false, error: errorMsg };
    }
}

export async function handleDaytonaGitClone(
    input: { repo_url: string; destination?: string },
    workspaceId: bigint,
    jobId: bigint
): Promise<any> {
    const { repo_url, destination = '.' } = input;
    console.log(`[Daytona Tool] Cloning Git repo into sandbox: ${repo_url}`);
    await updateJobProgress(jobId, `Cloning ${repo_url}...`);
    const command = destination === '.'
        ? `git clone ${repo_url}`
        : `git clone ${repo_url} ${destination}`;
    const result = await daytonaManager.executeCommand(workspaceId, command);
    if (result.exitCode !== 0) {
        throw new Error(`Git clone failed: ${result.stderr || result.stdout}`);
    }
    await updateJobProgress(jobId, `Cloned ${repo_url}`);
    return {
        success: true,
        repo_url,
        destination,
        output: result.stdout,
        message: 'Repository cloned successfully'
    };
}
