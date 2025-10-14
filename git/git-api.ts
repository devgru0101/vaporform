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
