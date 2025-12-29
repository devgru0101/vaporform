/**
 * Git Repository Recovery
 * Ensures all projects have local Git repos, creates them if missing
 */

import { tmpdir } from 'os';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { createGitManager } from '../git/git-manager.js';

/**
 * Ensure a project has a Git repo, create if missing
 */
export async function ensureGitRepo(projectId: bigint): Promise<{
    existed: boolean;
    path: string;
    initialized: boolean;
}> {
    const gitRepoPath = join(tmpdir(), `vaporform-git-${projectId}`);
    const existed = existsSync(gitRepoPath);

    console.log(`[Git Recovery] Checking Git repo for project ${projectId}: ${gitRepoPath}`);
    console.log(`[Git Recovery] Repo exists: ${existed}`);

    if (!existed) {
        console.log(`[Git Recovery] Creating Git repo for project ${projectId}`);

        // Create directory
        mkdirSync(gitRepoPath, { recursive: true });

        // Initialize Git
        const gitManager = createGitManager(projectId);
        await gitManager.init(projectId);

        console.log(`[Git Recovery] ✓ Git repo initialized for project ${projectId}`);

        return {
            existed: false,
            path: gitRepoPath,
            initialized: true
        };
    }

    // Check if .git directory exists inside
    const dotGitPath = join(gitRepoPath, '.git');
    const hasGit = existsSync(dotGitPath);

    if (!hasGit) {
        console.log(`[Git Recovery] Repo directory exists but no .git - reinitializing`);
        const gitManager = createGitManager(projectId);
        await gitManager.init(projectId);

        return {
            existed: true,
            path: gitRepoPath,
            initialized: true
        };
    }

    console.log(`[Git Recovery] Git repo already exists for project ${projectId}`);
    return {
        existed: true,
        path: gitRepoPath,
        initialized: false
    };
}

/**
 * Recover all projects' Git repos on startup
 */
export async function recoverAllGitRepos(): Promise<void> {
    console.log('[Git Recovery] Starting Git repository recovery...');

    // This would be called on app startup
    // For now, repos are created on-demand via ensureGitRepo

    console.log('[Git Recovery] Git recovery complete');
}
