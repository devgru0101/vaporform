/**
 * Git API endpoints
 * Provides version control operations with RBAC enforcement
 */

import { api, Header } from 'encore.dev/api';
import { verifyClerkJWT } from '../shared/clerk-auth.js';
import { ensureProjectPermission } from '../projects/permissions.js';
import { createGitManager } from './git-manager.js';
import type { GitCommit } from '../shared/types.js';
import { ValidationError, toAPIError } from '../shared/errors.js';

interface InitRequest {
  authorization: Header<'Authorization'>;
  projectId: string;
  defaultBranch?: string;
}

interface CommitRequest {
  authorization: Header<'Authorization'>;
  projectId: string;
  message: string;
  files?: string[];
}

interface CommitResponse {
  commit: GitCommit;
}

interface GetHistoryRequest {
  authorization: Header<'Authorization'>;
  projectId: string;
  limit?: number;
}

interface GetHistoryResponse {
  commits: GitCommit[];
  total: number;
}

interface GetCommitRequest {
  authorization: Header<'Authorization'>;
  projectId: string;
  hash: string;
}

interface RollbackRequest {
  authorization: Header<'Authorization'>;
  projectId: string;
  commitHash: string;
}

interface CreateBranchRequest {
  authorization: Header<'Authorization'>;
  projectId: string;
  branchName: string;
  fromCommit?: string;
}

interface CheckoutBranchRequest {
  authorization: Header<'Authorization'>;
  projectId: string;
  branchName: string;
}

interface ListBranchesRequest {
  authorization: Header<'Authorization'>;
  projectId: string;
}

interface ListBranchesResponse {
  branches: Array<{
    name: string;
    commitHash: string;
    isDefault: boolean;
  }>;
}

interface GetDiffRequest {
  authorization: Header<'Authorization'>;
  projectId: string;
  commitA: string;
  commitB: string;
}

interface GetDiffResponse {
  diff: string;
}

/**
 * Initialize Git repository for a project
 */
export const initRepository = api(
  { method: 'POST', path: '/git/init' },
  async (req: InitRequest): Promise<{ success: boolean }> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const projectId = BigInt(req.projectId);

    await ensureProjectPermission(userId, projectId, 'edit');

    const git = createGitManager(projectId);

    try {
      await git.init(projectId, req.defaultBranch || 'main');
      return { success: true };
    } finally {
      git.cleanup();
    }
  }
);

/**
 * Create a commit
 */
export const createCommit = api(
  { method: 'POST', path: '/git/commit' },
  async (req: CommitRequest): Promise<CommitResponse> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const projectId = BigInt(req.projectId);

    await ensureProjectPermission(userId, projectId, 'edit');

    if (!req.message || req.message.trim().length === 0) {
      throw toAPIError(new ValidationError('Commit message is required'));
    }

    // Get user info for commit author
    // For now using placeholder - will be enhanced with actual user data
    const authorName = 'Vaporform User';
    const authorEmail = `${userId}@vaporform.dev`;

    const git = createGitManager(projectId);

    try {
      const commit = await git.commit(
        projectId,
        req.message,
        authorName,
        authorEmail,
        req.files
      );

      return { commit };
    } finally {
      git.cleanup();
    }
  }
);

/**
 * Get commit history
 */
export const getHistory = api(
  { method: 'GET', path: '/git/history/:projectId' },
  async (req: GetHistoryRequest): Promise<GetHistoryResponse> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const projectId = BigInt(req.projectId);

    await ensureProjectPermission(userId, projectId, 'view');

    const git = createGitManager(projectId);

    try {
      const commits = await git.getHistory(projectId, req.limit || 50);

      return {
        commits,
        total: commits.length,
      };
    } finally {
      git.cleanup();
    }
  }
);

/**
 * Get a specific commit
 */
export const getCommit = api(
  { method: 'GET', path: '/git/commit/:projectId/:hash' },
  async (req: GetCommitRequest): Promise<CommitResponse> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const projectId = BigInt(req.projectId);

    await ensureProjectPermission(userId, projectId, 'view');

    const git = createGitManager(projectId);

    try {
      const commit = await git.getCommit(projectId, req.hash);

      return { commit };
    } finally {
      git.cleanup();
    }
  }
);

/**
 * Rollback to a specific commit
 */
export const rollback = api(
  { method: 'POST', path: '/git/rollback' },
  async (req: RollbackRequest): Promise<{ success: boolean }> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const projectId = BigInt(req.projectId);

    await ensureProjectPermission(userId, projectId, 'edit');

    const git = createGitManager(projectId);

    try {
      await git.rollback(projectId, req.commitHash);

      return { success: true };
    } finally {
      git.cleanup();
    }
  }
);

/**
 * Create a new branch
 */
export const createBranch = api(
  { method: 'POST', path: '/git/branch' },
  async (req: CreateBranchRequest): Promise<{ success: boolean }> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const projectId = BigInt(req.projectId);

    await ensureProjectPermission(userId, projectId, 'edit');

    if (!req.branchName || req.branchName.trim().length === 0) {
      throw toAPIError(new ValidationError('Branch name is required'));
    }

    const git = createGitManager(projectId);

    try {
      await git.createBranch(projectId, req.branchName, req.fromCommit);

      return { success: true };
    } finally {
      git.cleanup();
    }
  }
);

/**
 * Switch to a branch
 */
export const checkoutBranch = api(
  { method: 'POST', path: '/git/checkout' },
  async (req: CheckoutBranchRequest): Promise<{ success: boolean }> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const projectId = BigInt(req.projectId);

    await ensureProjectPermission(userId, projectId, 'edit');

    const git = createGitManager(projectId);

    try {
      await git.checkoutBranch(projectId, req.branchName);

      return { success: true };
    } finally {
      git.cleanup();
    }
  }
);

/**
 * List all branches
 */
export const listBranches = api(
  { method: 'GET', path: '/git/branches/:projectId' },
  async (req: ListBranchesRequest): Promise<ListBranchesResponse> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const projectId = BigInt(req.projectId);

    await ensureProjectPermission(userId, projectId, 'view');

    const git = createGitManager(projectId);

    try {
      const branches = await git.listBranches(projectId);

      return { branches };
    } finally {
      git.cleanup();
    }
  }
);

/**
 * Get diff between two commits
 */
export const getDiff = api(
  { method: 'GET', path: '/git/diff/:projectId' },
  async (req: GetDiffRequest): Promise<GetDiffResponse> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const projectId = BigInt(req.projectId);

    await ensureProjectPermission(userId, projectId, 'view');

    const git = createGitManager(projectId);

    try {
      const diff = await git.getDiff(req.commitA, req.commitB);

      return { diff };
    } finally {
      git.cleanup();
    }
  }
);

/**
 * GitHub Integration Endpoints
 */

interface GitHubConnectionRequest {
  authorization: Header<'Authorization'>;
  projectId: string;
}

interface GitHubConnectionResponse {
  connected: boolean;
  pat?: string;
  repoFullName?: string;
  defaultBranch?: string;
}

interface ConnectGitHubRequest {
  authorization: Header<'Authorization'>;
  projectId: string;
  pat: string;
}

interface ListGitHubReposRequest {
  authorization: Header<'Authorization'>;
  pat: string;
}

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  default_branch: string;
  html_url: string;
}

interface ListGitHubReposResponse {
  repos: GitHubRepo[];
}

interface CreateGitHubRepoRequest {
  authorization: Header<'Authorization'>;
  pat: string;
  name: string;
  private: boolean;
}

interface CreateGitHubRepoResponse {
  repo: GitHubRepo;
}

interface PushToGitHubRequest {
  authorization: Header<'Authorization'>;
  projectId: string;
  pat: string;
  repoFullName: string;
  branch: string;
}

/**
 * Get GitHub connection status for a project
 */
export const getGitHubConnection = api(
  { method: 'GET', path: '/git/github/connection/:projectId' },
  async (req: GitHubConnectionRequest): Promise<GitHubConnectionResponse> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const projectId = BigInt(req.projectId);

    await ensureProjectPermission(userId, projectId, 'view');

    const { db } = await import('../projects/db.js');

    const row = await db.queryRow<{
      github_pat: string | null;
      github_repo_full_name: string | null;
      github_default_branch: string | null;
    }>`
      SELECT github_pat, github_repo_full_name, github_default_branch
      FROM projects
      WHERE id = ${projectId}
    `;

    if (!row || !row.github_pat) {
      return { connected: false };
    }

    return {
      connected: true,
      pat: row.github_pat,
      repoFullName: row.github_repo_full_name || undefined,
      defaultBranch: row.github_default_branch || 'main',
    };
  }
);

/**
 * Connect a project to GitHub
 */
export const connectGitHub = api(
  { method: 'POST', path: '/git/github/connect' },
  async (req: ConnectGitHubRequest): Promise<{ success: boolean }> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const projectId = BigInt(req.projectId);

    await ensureProjectPermission(userId, projectId, 'edit');

    if (!req.pat || req.pat.trim().length === 0) {
      throw toAPIError(new ValidationError('GitHub Personal Access Token is required'));
    }

    // Validate PAT by making a test API call
    const testResponse = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${req.pat}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (!testResponse.ok) {
      throw toAPIError(new ValidationError('Invalid GitHub Personal Access Token'));
    }

    const { db } = await import('../projects/db.js');

    await db.query`
      UPDATE projects
      SET github_pat = ${req.pat}
      WHERE id = ${projectId}
    `;

    return { success: true };
  }
);

/**
 * List GitHub repositories for the authenticated user
 */
export const listGitHubRepos = api(
  { method: 'POST', path: '/git/github/repos' },
  async (req: ListGitHubReposRequest): Promise<ListGitHubReposResponse> => {
    await verifyClerkJWT(req.authorization);

    if (!req.pat || req.pat.trim().length === 0) {
      throw toAPIError(new ValidationError('GitHub Personal Access Token is required'));
    }

    const response = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated', {
      headers: {
        Authorization: `Bearer ${req.pat}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (!response.ok) {
      throw toAPIError(new ValidationError('Failed to fetch GitHub repositories'));
    }

    const repos = (await response.json()) as GitHubRepo[];

    return { repos };
  }
);

/**
 * Create a new GitHub repository
 */
export const createGitHubRepo = api(
  { method: 'POST', path: '/git/github/create-repo' },
  async (req: CreateGitHubRepoRequest): Promise<CreateGitHubRepoResponse> => {
    await verifyClerkJWT(req.authorization);

    if (!req.pat || req.pat.trim().length === 0) {
      throw toAPIError(new ValidationError('GitHub Personal Access Token is required'));
    }

    if (!req.name || req.name.trim().length === 0) {
      throw toAPIError(new ValidationError('Repository name is required'));
    }

    const response = await fetch('https://api.github.com/user/repos', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${req.pat}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: req.name,
        private: req.private,
        auto_init: true,
      }),
    });

    if (!response.ok) {
      const error = await response.json() as any; // Type unknown from JSON response
      throw toAPIError(
        new ValidationError(error.message || 'Failed to create GitHub repository')
      );
    }

    const repo = (await response.json()) as GitHubRepo;

    return { repo };
  }
);

/**
 * Push local commits to GitHub
 */
export const pushToGitHub = api(
  { method: 'POST', path: '/git/github/push' },
  async (req: PushToGitHubRequest): Promise<{ success: boolean }> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const projectId = BigInt(req.projectId);

    await ensureProjectPermission(userId, projectId, 'edit');

    if (!req.pat || req.pat.trim().length === 0) {
      throw toAPIError(new ValidationError('GitHub Personal Access Token is required'));
    }

    if (!req.repoFullName || req.repoFullName.trim().length === 0) {
      throw toAPIError(new ValidationError('Repository full name is required'));
    }

    const git = createGitManager(projectId);

    try {
      // Add GitHub remote if it doesn't exist
      const remoteUrl = `https://${req.pat}@github.com/${req.repoFullName}.git`;
      await git.addRemote('origin', remoteUrl);

      // Push to GitHub
      await git.push('origin', req.branch || 'main');

      // Update project with GitHub repo info
      const { db } = await import('../projects/db.js');
      await db.query`
        UPDATE projects
        SET
          github_repo_full_name = ${req.repoFullName},
          github_default_branch = ${req.branch || 'main'}
        WHERE id = ${projectId}
      `;

      return { success: true };
    } finally {
      git.cleanup();
    }
  }
);

/**
 * Get branches for a GitHub repository
 */
interface GetGitHubBranchesRequest {
  authorization: Header<'Authorization'>;
  pat: string;
  repoFullName: string;
}

interface GitHubBranch {
  name: string;
  commit: {
    sha: string;
    url: string;
  };
  protected: boolean;
}

interface GetGitHubBranchesResponse {
  branches: GitHubBranch[];
}

export const getGitHubBranches = api(
  { method: 'POST', path: '/git/github/branches' },
  async (req: GetGitHubBranchesRequest): Promise<GetGitHubBranchesResponse> => {
    await verifyClerkJWT(req.authorization);

    if (!req.pat || req.pat.trim().length === 0) {
      throw toAPIError(new ValidationError('GitHub Personal Access Token is required'));
    }

    if (!req.repoFullName || req.repoFullName.trim().length === 0) {
      throw toAPIError(new ValidationError('Repository full name is required'));
    }

    const response = await fetch(
      `https://api.github.com/repos/${req.repoFullName}/branches`,
      {
        headers: {
          Authorization: `Bearer ${req.pat}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        throw toAPIError(new ValidationError('Repository not found'));
      }
      throw toAPIError(new ValidationError('Failed to fetch branches'));
    }

    const branches = (await response.json()) as GitHubBranch[];

    return { branches };
  }
);

/**
 * Import a GitHub repository into a project
 */
interface ImportGitHubRepoRequest {
  authorization: Header<'Authorization'>;
  projectId: string;
  pat: string;
  repoFullName: string;
  branch: string;
}

export const importGitHubRepo = api(
  { method: 'POST', path: '/git/github/import' },
  async (req: ImportGitHubRepoRequest): Promise<{ success: boolean }> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const projectId = BigInt(req.projectId);

    await ensureProjectPermission(userId, projectId, 'edit');

    if (!req.pat || req.pat.trim().length === 0) {
      throw toAPIError(new ValidationError('GitHub Personal Access Token is required'));
    }

    if (!req.repoFullName || req.repoFullName.trim().length === 0) {
      throw toAPIError(new ValidationError('Repository full name is required'));
    }

    if (!req.branch || req.branch.trim().length === 0) {
      throw toAPIError(new ValidationError('Branch name is required'));
    }

    const git = createGitManager(projectId);

    try {
      // Clone the repository with the specified branch
      const repoUrl = `https://github.com/${req.repoFullName}.git`;
      await git.cloneRepository(repoUrl, req.pat, req.branch);

      // Sync files from working directory to VFS
      await git.syncToVFS(projectId);

      // Initialize git tracking in database
      await git.initFromExisting(projectId, req.branch);

      // Update project with import metadata
      const { db } = await import('../projects/db.js');
      await db.query`
        UPDATE projects
        SET
          github_imported_from = ${repoUrl},
          github_imported_branch = ${req.branch},
          github_import_date = NOW(),
          github_pat = ${req.pat},
          github_repo_full_name = ${req.repoFullName},
          github_default_branch = ${req.branch},
          git_initialized = true
        WHERE id = ${projectId}
      `;

      console.log(
        `✓ Imported GitHub repository ${req.repoFullName} (${req.branch}) to project ${projectId}`
      );

      return { success: true };
    } finally {
      git.cleanup();
    }
  }
);
