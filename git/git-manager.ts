/**
 * Git Manager
 * Manages Git operations using simple-git with VFS integration
 */

import simpleGit, { SimpleGit, StatusResult, LogResult } from 'simple-git';
import { SQLDatabase } from 'encore.dev/storage/sqldb';
import { gridfs } from '../vfs/gridfs.js';
import type { GitCommit } from '../shared/types.js';
import { ValidationError, NotFoundError } from '../shared/errors.js';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'fs';

const db = new SQLDatabase('git', {
  migrations: './migrations',
});

export class GitManager {
  private git: SimpleGit;
  private workdir: string;

  constructor(projectId: bigint) {
    // Create temporary working directory for this project
    this.workdir = join(tmpdir(), `vaporform-git-${projectId}`);

    if (!existsSync(this.workdir)) {
      mkdirSync(this.workdir, { recursive: true });
    }

    this.git = simpleGit(this.workdir);
  }

  /**
   * Initialize Git repository
   */
  async init(projectId: bigint, defaultBranch: string = 'main'): Promise<void> {
    // Check if already initialized
    const existing = await db.queryRow<{ id: bigint }>`
      SELECT id FROM git_branches
      WHERE project_id = ${projectId}
      LIMIT 1
    `;

    if (existing) {
      console.log(`Git already initialized for project ${projectId}`);
      return;
    }

    // Initialize git repo
    await this.git.init();
    await this.git.addConfig('user.name', 'Vaporform');
    await this.git.addConfig('user.email', 'bot@vaporform.dev');

    // Create initial commit
    const initialFile = join(this.workdir, '.gitkeep');
    writeFileSync(initialFile, '');
    await this.git.add('.gitkeep');
    const result = await this.git.commit('Initial commit');

    // Store branch
    await db.exec`
      INSERT INTO git_branches (project_id, name, commit_hash, is_default)
      VALUES (${projectId}, ${defaultBranch}, ${result.commit}, true)
    `;

    // Store commit
    await db.exec`
      INSERT INTO git_commits (
        project_id,
        commit_hash,
        author_name,
        author_email,
        message,
        parent_hash,
        timestamp,
        files_changed
      ) VALUES (
        ${projectId},
        ${result.commit},
        'Vaporform',
        'bot@vaporform.dev',
        'Initial commit',
        NULL,
        NOW(),
        1
      )
    `;

    console.log(`✓ Initialized Git repository for project ${projectId} on branch ${defaultBranch}`);
  }

  /**
   * Sync files from VFS to working directory
   */
  async syncFromVFS(projectId: bigint, paths?: string[]): Promise<void> {
    // Get files from VFS
    const files = paths || await this.getAllFilePaths(projectId);

    for (const path of files) {
      try {
        const content = await gridfs.readFile(projectId, path);
        const fullPath = join(this.workdir, path);

        // Ensure directory exists
        const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
        if (dir && !existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }

        writeFileSync(fullPath, content);
      } catch (error) {
        console.warn(`Warning: Could not sync file ${path}:`, error);
      }
    }
  }

  /**
   * Get all file paths from VFS for a project
   */
  private async getAllFilePaths(projectId: bigint): Promise<string[]> {
    const paths: string[] = [];

    const files = await db.query<{ path: string }>`
      SELECT path FROM file_metadata
      WHERE project_id = ${projectId}
      AND is_directory = false
      AND deleted_at IS NULL
    `;

    for await (const file of files) {
      paths.push(file.path);
    }

    return paths;
  }

  /**
   * Create a commit
   */
  async commit(
    projectId: bigint,
    message: string,
    authorName: string,
    authorEmail: string,
    files?: string[]
  ): Promise<GitCommit> {
    if (!message || message.trim().length === 0) {
      throw new ValidationError('Commit message cannot be empty');
    }

    // Sync files from VFS
    await this.syncFromVFS(projectId, files);

    // Set author
    await this.git.addConfig('user.name', authorName);
    await this.git.addConfig('user.email', authorEmail);

    // Stage files
    if (files && files.length > 0) {
      await this.git.add(files);
    } else {
      await this.git.add('.');
    }

    // Check if there are changes to commit
    const status = await this.git.status();
    if (status.staged.length === 0) {
      throw new ValidationError('No changes to commit');
    }

    // Create commit
    const result = await this.git.commit(message);

    // Get current branch
    const branch = await this.getCurrentBranch(projectId);

    // Update branch pointer
    await db.exec`
      UPDATE git_branches
      SET commit_hash = ${result.commit}, updated_at = NOW()
      WHERE project_id = ${projectId}
      AND name = ${branch}
    `;

    // Get parent commit
    const log = await this.git.log({ maxCount: 2 });
    const parentHash = log.all.length > 1 ? log.all[1].hash : null;

    // Store commit
    const commit = await db.queryRow<GitCommit>`
      INSERT INTO git_commits (
        project_id,
        commit_hash,
        author_name,
        author_email,
        message,
        parent_hash,
        timestamp,
        files_changed,
        insertions,
        deletions
      ) VALUES (
        ${projectId},
        ${result.commit},
        ${authorName},
        ${authorEmail},
        ${message},
        ${parentHash},
        NOW(),
        ${status.staged.length},
        ${result.summary.insertions || 0},
        ${result.summary.deletions || 0}
      )
      RETURNING *
    `;

    if (!commit) {
      throw new Error('Failed to store commit');
    }

    console.log(`✓ Created commit ${result.commit.substring(0, 7)} for project ${projectId}`);

    return commit;
  }

  /**
   * Get commit history
   */
  async getHistory(projectId: bigint, limit: number = 50): Promise<GitCommit[]> {
    const commits: GitCommit[] = [];

    for await (const commit of db.query<GitCommit>`
      SELECT * FROM git_commits
      WHERE project_id = ${projectId}
      ORDER BY timestamp DESC
      LIMIT ${limit}
    `) {
      commits.push(commit);
    }

    return commits;
  }

  /**
   * Get commit by hash
   */
  async getCommit(projectId: bigint, hash: string): Promise<GitCommit> {
    const commit = await db.queryRow<GitCommit>`
      SELECT * FROM git_commits
      WHERE project_id = ${projectId}
      AND commit_hash = ${hash}
    `;

    if (!commit) {
      throw new NotFoundError(`Commit not found: ${hash}`);
    }

    return commit;
  }

  /**
   * Rollback to a specific commit
   */
  async rollback(projectId: bigint, commitHash: string): Promise<void> {
    // Verify commit exists
    const commit = await this.getCommit(projectId, commitHash);

    // Reset to commit
    await this.git.reset(['--hard', commitHash]);

    // Update current branch pointer
    const branch = await this.getCurrentBranch(projectId);
    await db.exec`
      UPDATE git_branches
      SET commit_hash = ${commitHash}, updated_at = NOW()
      WHERE project_id = ${projectId}
      AND name = ${branch}
    `;

    // TODO: Sync files back to VFS
    // This requires reading all files from working directory and updating VFS
    // Implementation pending based on VFS API

    console.log(`✓ Rolled back project ${projectId} to commit ${commitHash.substring(0, 7)}`);
  }

  /**
   * Create a new branch
   */
  async createBranch(projectId: bigint, branchName: string, fromCommit?: string): Promise<void> {
    // Check if branch already exists
    const existing = await db.queryRow<{ id: bigint }>`
      SELECT id FROM git_branches
      WHERE project_id = ${projectId}
      AND name = ${branchName}
    `;

    if (existing) {
      throw new ValidationError(`Branch already exists: ${branchName}`);
    }

    // Get commit hash
    let commitHash: string;
    if (fromCommit) {
      const commit = await this.getCommit(projectId, fromCommit);
      commitHash = commit.commit_hash;
    } else {
      const currentBranch = await this.getCurrentBranch(projectId);
      const branch = await db.queryRow<{ commit_hash: string }>`
        SELECT commit_hash FROM git_branches
        WHERE project_id = ${projectId}
        AND name = ${currentBranch}
      `;
      if (!branch) {
        throw new Error('Current branch not found');
      }
      commitHash = branch.commit_hash;
    }

    // Create branch
    await this.git.checkoutBranch(branchName, commitHash);

    // Store branch
    await db.exec`
      INSERT INTO git_branches (project_id, name, commit_hash, is_default)
      VALUES (${projectId}, ${branchName}, ${commitHash}, false)
    `;

    console.log(`✓ Created branch ${branchName} for project ${projectId}`);
  }

  /**
   * Switch to a branch
   */
  async checkoutBranch(projectId: bigint, branchName: string): Promise<void> {
    // Verify branch exists
    const branch = await db.queryRow<{ commit_hash: string }>`
      SELECT commit_hash FROM git_branches
      WHERE project_id = ${projectId}
      AND name = ${branchName}
    `;

    if (!branch) {
      throw new NotFoundError(`Branch not found: ${branchName}`);
    }

    // Checkout branch
    await this.git.checkout(branchName);

    console.log(`✓ Switched to branch ${branchName} for project ${projectId}`);
  }

  /**
   * Get current branch name
   */
  async getCurrentBranch(projectId: bigint): Promise<string> {
    const branch = await db.queryRow<{ name: string }>`
      SELECT name FROM git_branches
      WHERE project_id = ${projectId}
      AND is_default = true
    `;

    return branch?.name || 'main';
  }

  /**
   * List all branches
   */
  async listBranches(projectId: bigint): Promise<Array<{ name: string; commitHash: string; isDefault: boolean }>> {
    const branches: Array<{ name: string; commitHash: string; isDefault: boolean }> = [];

    for await (const branch of db.query<{ name: string; commit_hash: string; is_default: boolean }>`
      SELECT name, commit_hash, is_default FROM git_branches
      WHERE project_id = ${projectId}
      ORDER BY is_default DESC, created_at ASC
    `) {
      branches.push({
        name: branch.name,
        commitHash: branch.commit_hash,
        isDefault: branch.is_default,
      });
    }

    return branches;
  }

  /**
   * Get diff between commits
   */
  async getDiff(commitA: string, commitB: string): Promise<string> {
    const diff = await this.git.diff([commitA, commitB]);
    return diff;
  }

  /**
   * Get current status
   */
  async getStatus(): Promise<StatusResult> {
    return await this.git.status();
  }

  /**
   * Add a remote repository
   */
  async addRemote(name: string, url: string): Promise<void> {
    try {
      // Check if remote already exists
      const remotes = await this.git.getRemotes();
      const existingRemote = remotes.find((r) => r.name === name);

      if (existingRemote) {
        // Update existing remote URL
        await this.git.remote(['set-url', name, url]);
        console.log(`✓ Updated remote '${name}' to ${url}`);
      } else {
        // Add new remote
        await this.git.addRemote(name, url);
        console.log(`✓ Added remote '${name}': ${url}`);
      }
    } catch (error) {
      console.error(`Failed to add/update remote '${name}':`, error);
      throw new ValidationError(`Failed to add/update remote: ${error}`);
    }
  }

  /**
   * Push to remote repository
   */
  async push(remote: string, branch: string): Promise<void> {
    try {
      console.log(`Pushing ${branch} to ${remote}...`);
      await this.git.push(remote, branch);
      console.log(`✓ Successfully pushed ${branch} to ${remote}`);
    } catch (error) {
      console.error(`Failed to push to ${remote}:`, error);
      throw new ValidationError(`Failed to push: ${error}`);
    }
  }

  /**
   * Clean up working directory
   */
  cleanup(): void {
    try {
      if (existsSync(this.workdir)) {
        rmSync(this.workdir, { recursive: true, force: true });
      }
    } catch (error) {
      console.warn(`Warning: Could not clean up working directory ${this.workdir}:`, error);
    }
  }
}

/**
 * Create a GitManager instance for a project
 */
export function createGitManager(projectId: bigint): GitManager {
  return new GitManager(projectId);
}
