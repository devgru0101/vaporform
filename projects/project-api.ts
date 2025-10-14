/**
 * Project API endpoints
 * Core CRUD operations for projects with RBAC
 */

import { api, Header, Query } from 'encore.dev/api';
import { verifyClerkJWT } from '../shared/clerk-auth.js';
import type { Project } from '../shared/types.js';
import {
  checkProjectPermission,
  ensureProjectPermission,
  getProjectWithPermission,
  checkProjectCreationLimit
} from './permissions.js';
import {
  ValidationError,
  NotFoundError,
  QuotaExceededError,
  toAPIError
} from '../shared/errors.js';
import { generateProjectSlug, generateSubdomain } from '../shared/utils.js';
import { db } from './db.js';

interface CreateProjectRequest {
  authorization: Header<'Authorization'>;
  name: string;
  description?: string;
  template?: string;
  orgId?: string;
  wizardData?: any;
  generateCode?: boolean;
}

interface UpdateProjectRequest {
  authorization: Header<'Authorization'>;
  projectId: string;
  name?: string;
  description?: string;
  deploymentStatus?: 'none' | 'building' | 'deployed' | 'failed';
  deploymentUrl?: string;
  daytonaWorkspaceId?: string;
}

interface GetProjectResponse {
  project: Project;
}

interface ListProjectsRequest {
  authorization: Header<'Authorization'>;
  orgId?: Query<string>;
  limit?: Query<number>;
  offset?: Query<number>;
}

interface ListProjectsResponse {
  projects: Project[];
  total: number;
}

/**
 * Create a new project
 */
export const createProject = api(
  { method: 'POST', path: '/projects' },
  async (req: CreateProjectRequest): Promise<GetProjectResponse> => {
    const { userId } = await verifyClerkJWT(req.authorization);

    // Validate project name
    if (!req.name || req.name.length < 3 || req.name.length > 50) {
      throw toAPIError(new ValidationError('Project name must be between 3 and 50 characters'));
    }

    // Check project creation limits
    const limitCheck = await checkProjectCreationLimit(userId, req.orgId);
    if (!limitCheck.allowed) {
      throw toAPIError(new QuotaExceededError(limitCheck.reason || 'Project limit reached'));
    }

    // Generate unique slug
    const slug = generateProjectSlug(req.name);

    try {
      // Create project
      const project = await db.queryRow<Project>`
        INSERT INTO projects (
          clerk_org_id,
          clerk_user_id,
          name,
          description,
          template,
          deployment_url,
          wizard_data,
          generation_status
        ) VALUES (
          ${req.orgId || null},
          ${userId},
          ${req.name},
          ${req.description || null},
          ${req.template || null},
          ${generateSubdomain(slug) + '.vaporform.dev'},
          ${req.wizardData ? JSON.stringify(req.wizardData) : null},
          ${req.generateCode ? 'pending' : 'not_started'}
        )
        RETURNING *
      `;

      if (!project) {
        throw new Error('Failed to create project');
      }

      console.log(`✓ Created project: ${req.name} (ID: ${project.id})`);

      // Automatically create Daytona workspace for the project
      try {
        const { daytonaManager } = await import('../workspace/daytona-manager.js');
        const workspaceName = `${req.name} Workspace`;
        const template = req.template || req.wizardData?.framework || 'typescript';

        await daytonaManager.createWorkspace(project.id, workspaceName, {
          language: template,
          environment: {
            PROJECT_ID: project.id.toString(),
            PROJECT_NAME: req.name,
          },
          autoStopInterval: 60, // Auto-stop after 1 hour
          autoArchiveInterval: 24 * 60, // Auto-archive after 24 hours
          ephemeral: false,
        });
        console.log(`✓ Created Daytona workspace for project: ${req.name}`);
      } catch (error) {
        console.error(`Failed to create workspace for project ${project.id}:`, error);
        // Continue even if workspace creation fails
      }

      // If generateCode is true, start generation
      if (req.generateCode && req.wizardData) {
        const { startProjectGeneration } = await import('../ai/project-generator.js');
        await startProjectGeneration(project.id, req.wizardData, userId);
        console.log(`✓ Started code generation for project: ${req.name}`);
      }

      return { project };
    } catch (error: any) {
      // Check for duplicate key constraint violation
      if (error?.cause?.code === 'E23505' || error?.cause?.constraint === 'unique_personal_project' || error?.cause?.constraint === 'unique_org_project') {
        throw toAPIError(new ValidationError(`A project named "${req.name}" already exists. Please choose a different name.`));
      }

      // Re-throw other errors
      throw error;
    }
  }
);

/**
 * Get project by ID
 */
export const getProject = api(
  { method: 'GET', path: '/projects/:projectId' },
  async ({
    authorization,
    projectId
  }: {
    authorization: Header<'Authorization'>;
    projectId: string;
  }): Promise<GetProjectResponse> => {
    const { userId } = await verifyClerkJWT(authorization);
    const id = BigInt(projectId);

    const project = await getProjectWithPermission(userId, id, 'view');

    // Smart workspace management: create if missing, start if stopped
    try {
      const { daytonaManager } = await import('../workspace/daytona-manager.js');
      const workspace = await daytonaManager.getProjectWorkspace(id);

      if (!workspace) {
        // No workspace exists - create one for this existing project
        console.log(`[Workspace Manager] Creating Daytona workspace for existing project ${id} (${project.name})`);
        const workspaceName = `${project.name} Workspace`;
        const template = project.template || 'typescript';

        await daytonaManager.createWorkspace(id, workspaceName, {
          language: template,
          environment: {
            PROJECT_ID: id.toString(),
            PROJECT_NAME: project.name,
          },
          autoStopInterval: 60, // Auto-stop after 1 hour
          autoArchiveInterval: 24 * 60, // Auto-archive after 24 hours
          ephemeral: false,
        });
        console.log(`[Workspace Manager] ✓ Created Daytona workspace for project ${id}`);
      } else if (workspace.status === 'stopped') {
        // Workspace exists but stopped - restart it
        console.log(`[Workspace Manager] Auto-starting stopped workspace for project ${id}`);
        await daytonaManager.restartWorkspace(workspace.id);
        console.log(`[Workspace Manager] ✓ Restarted workspace for project ${id}`);
      } else if (workspace.status === 'error') {
        // Workspace in error state - try to recover
        console.log(`[Workspace Manager] Attempting to recover errored workspace for project ${id}`);
        await daytonaManager.restartWorkspace(workspace.id);
        console.log(`[Workspace Manager] ✓ Recovered workspace for project ${id}`);
      } else if (workspace.status === 'running') {
        console.log(`[Workspace Manager] Workspace already running for project ${id}`);
      } else {
        console.log(`[Workspace Manager] Workspace status for project ${id}: ${workspace.status}`);
      }
    } catch (error) {
      console.error(`[Workspace Manager] Failed to manage workspace for project ${id}:`, error);
      // Continue even if workspace management fails
    }

    return { project };
  }
);

/**
 * List projects for current user
 */
export const listMyProjects = api(
  { method: 'GET', path: '/projects' },
  async (req: ListProjectsRequest): Promise<ListProjectsResponse> => {
    const { userId } = await verifyClerkJWT(req.authorization);

    const orgId = req.orgId;
    const limit = req.limit || 50;
    const offset = req.offset || 0;

    const projects: Project[] = [];

    if (orgId) {
      // List organization projects
      for await (const project of db.query<Project>`
        SELECT * FROM projects
        WHERE clerk_org_id = ${orgId}
        AND deleted_at IS NULL
        ORDER BY created_at DESC
        LIMIT ${limit}
        OFFSET ${offset}
      `) {
        // Check if user has access to this org project
        const hasAccess = await checkProjectPermission(userId, project.id, 'view');
        if (hasAccess) {
          projects.push(project);
        }
      }
    } else {
      // List personal projects
      for await (const project of db.query<Project>`
        SELECT * FROM projects
        WHERE clerk_user_id = ${userId}
        AND clerk_org_id IS NULL
        AND deleted_at IS NULL
        ORDER BY created_at DESC
        LIMIT ${limit}
        OFFSET ${offset}
      `) {
        projects.push(project);
      }
    }

    // Get total count
    const countQuery = orgId
      ? db.queryRow<{ count: bigint }>`
          SELECT COUNT(*) as count FROM projects
          WHERE clerk_org_id = ${orgId}
          AND deleted_at IS NULL
        `
      : db.queryRow<{ count: bigint }>`
          SELECT COUNT(*) as count FROM projects
          WHERE clerk_user_id = ${userId}
          AND clerk_org_id IS NULL
          AND deleted_at IS NULL
        `;

    const countResult = await countQuery;
    const total = Number(countResult?.count || 0);

    return { projects, total };
  }
);

/**
 * Update project
 */
export const updateProject = api(
  { method: 'PUT', path: '/projects/:projectId' },
  async (req: UpdateProjectRequest): Promise<GetProjectResponse> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const id = BigInt(req.projectId);

    // Check edit permission
    await ensureProjectPermission(userId, id, 'edit');

    // Build update query dynamically
    const updates: string[] = [];
    const values: any[] = [];

    if (req.name !== undefined) {
      updates.push(`name = $${updates.length + 1}`);
      values.push(req.name);
    }

    if (req.description !== undefined) {
      updates.push(`description = $${updates.length + 1}`);
      values.push(req.description);
    }

    if (req.deploymentStatus !== undefined) {
      updates.push(`deployment_status = $${updates.length + 1}`);
      values.push(req.deploymentStatus);
    }

    if (req.deploymentUrl !== undefined) {
      updates.push(`deployment_url = $${updates.length + 1}`);
      values.push(req.deploymentUrl);
    }

    if (req.daytonaWorkspaceId !== undefined) {
      updates.push(`daytona_workspace_id = $${updates.length + 1}`);
      values.push(req.daytonaWorkspaceId);
    }

    updates.push('updated_at = NOW()');

    if (updates.length === 1) {
      // Only updated_at, nothing to update
      const project = await getProjectWithPermission(userId, id, 'view');
      return { project };
    }

    await db.exec`
      UPDATE projects
      SET
        name = COALESCE(${req.name || null}, name),
        description = COALESCE(${req.description || null}, description),
        deployment_status = COALESCE(${req.deploymentStatus || null}, deployment_status),
        deployment_url = COALESCE(${req.deploymentUrl || null}, deployment_url),
        daytona_workspace_id = COALESCE(${req.daytonaWorkspaceId || null}, daytona_workspace_id),
        updated_at = NOW()
      WHERE id = ${id}
    `;

    const project = await getProjectWithPermission(userId, id, 'view');

    console.log(`✓ Updated project: ${project.name} (ID: ${project.id})`);

    return { project };
  }
);

/**
 * Delete project (comprehensive cleanup)
 */
export const deleteProject = api(
  { method: 'DELETE', path: '/projects/:projectId' },
  async ({
    authorization,
    projectId
  }: {
    authorization: Header<'Authorization'>;
    projectId: string;
  }): Promise<{ success: boolean }> => {
    const { userId } = await verifyClerkJWT(authorization);
    const id = BigInt(projectId);

    // Check delete permission
    await ensureProjectPermission(userId, id, 'delete');

    console.log(`[Delete Project] Starting deletion for project ${id}...`);

    try {
      // 1. Delete Daytona sandbox
      try {
        const { daytonaManager } = await import('../workspace/daytona-manager.js');
        const workspace = await daytonaManager.getProjectWorkspace(id);
        if (workspace) {
          console.log(`[Delete Project] Deleting Daytona workspace ${workspace.id}...`);
          await daytonaManager.deleteWorkspace(workspace.id);
          console.log(`[Delete Project] ✓ Deleted Daytona workspace ${workspace.id}`);
        }
      } catch (error) {
        console.error(`[Delete Project] Warning: Failed to delete Daytona workspace:`, error);
        // Continue with deletion even if Daytona cleanup fails
      }

      // 2. Delete vector embeddings from Qdrant
      try {
        const { qdrantManager } = await import('../vector/qdrant-manager.js');
        console.log(`[Delete Project] Deleting vector embeddings...`);
        await qdrantManager.deleteProject(id);
        console.log(`[Delete Project] ✓ Deleted vector embeddings`);
      } catch (error) {
        console.error(`[Delete Project] Warning: Failed to delete vector embeddings:`, error);
        // Continue with deletion
      }

      // 3. Delete files from MongoDB GridFS and PostgreSQL metadata
      try {
        const { gridfs } = await import('../vfs/gridfs.js');
        const VFSDatabase = await import('../vfs/db.js');
        const vfsDb = VFSDatabase.db;

        console.log(`[Delete Project] Deleting files from GridFS...`);

        // Get all files for this project
        const files: Array<{ gridfs_file_id: string; path: string }> = [];
        for await (const file of vfsDb.query<{ gridfs_file_id: string; path: string }>`
          SELECT gridfs_file_id, path FROM file_metadata
          WHERE project_id = ${id}
          AND is_directory = false
          AND gridfs_file_id IS NOT NULL
          AND gridfs_file_id != ''
        `) {
          files.push(file);
        }

        console.log(`[Delete Project] Found ${files.length} files to delete from GridFS`);

        // Delete from GridFS (best effort)
        for (const file of files) {
          try {
            await gridfs.delete(id, file.path, false);
          } catch (error) {
            console.warn(`[Delete Project] Warning: Could not delete file ${file.path}:`, error);
          }
        }

        // Hard delete file metadata
        await vfsDb.exec`
          DELETE FROM file_metadata
          WHERE project_id = ${id}
        `;

        console.log(`[Delete Project] ✓ Deleted ${files.length} files from GridFS and metadata`);
      } catch (error) {
        console.error(`[Delete Project] Warning: Failed to delete files:`, error);
        // Continue with deletion
      }

      // 4. Delete chat sessions and messages (CASCADE will handle messages)
      try {
        const AIDatabase = await import('../ai/db.js');
        const aiDb = AIDatabase.db;

        console.log(`[Delete Project] Deleting chat sessions and messages...`);

        // Get count for logging
        const chatCount = await aiDb.queryRow<{ count: bigint }>`
          SELECT COUNT(*) as count FROM chat_sessions WHERE project_id = ${id}
        `;

        // Hard delete chat sessions (messages cascade)
        await aiDb.exec`
          DELETE FROM chat_sessions WHERE project_id = ${id}
        `;

        // Delete UI components
        await aiDb.exec`
          DELETE FROM ui_components WHERE project_id = ${id}
        `;

        console.log(`[Delete Project] ✓ Deleted ${chatCount?.count || 0} chat sessions`);
      } catch (error) {
        console.error(`[Delete Project] Warning: Failed to delete chat data:`, error);
        // Continue with deletion
      }

      // 5. Delete workspace records and logs (CASCADE will handle logs)
      try {
        const WorkspaceDatabase = await import('../workspace/db.js');
        const workspaceDb = WorkspaceDatabase.db;

        console.log(`[Delete Project] Deleting workspace records...`);

        // Delete builds
        await workspaceDb.exec`
          DELETE FROM builds WHERE project_id = ${id}
        `;

        // Hard delete workspaces (logs cascade)
        await workspaceDb.exec`
          DELETE FROM workspaces WHERE project_id = ${id}
        `;

        console.log(`[Delete Project] ✓ Deleted workspace records`);
      } catch (error) {
        console.error(`[Delete Project] Warning: Failed to delete workspace data:`, error);
        // Continue with deletion
      }

      // 6. Finally, soft delete the project itself
      await db.exec`
        UPDATE projects
        SET deleted_at = NOW()
        WHERE id = ${id}
      `;

      console.log(`[Delete Project] ✓ Successfully deleted project ${id}`);

      return { success: true };
    } catch (error) {
      console.error(`[Delete Project] ✗ Error deleting project ${id}:`, error);
      throw error;
    }
  }
);

/**
 * Update project storage usage
 */
export const updateStorageUsage = api(
  { method: 'PUT', path: '/projects/:projectId/storage' },
  async ({
    authorization,
    projectId,
    bytes
  }: {
    authorization: Header<'Authorization'>;
    projectId: string;
    bytes: number;
  }): Promise<{ success: boolean }> => {
    const { userId } = await verifyClerkJWT(authorization);
    const id = BigInt(projectId);

    await ensureProjectPermission(userId, id, 'edit');

    await db.exec`
      UPDATE projects
      SET storage_used_bytes = ${bytes}
      WHERE id = ${id}
    `;

    return { success: true };
  }
);

/**
 * Update project compute usage
 */
export const updateComputeUsage = api(
  { method: 'PUT', path: '/projects/:projectId/compute' },
  async ({
    authorization,
    projectId,
    minutes
  }: {
    authorization: Header<'Authorization'>;
    projectId: string;
    minutes: number;
  }): Promise<{ success: boolean }> => {
    const { userId } = await verifyClerkJWT(authorization);
    const id = BigInt(projectId);

    await ensureProjectPermission(userId, id, 'edit');

    await db.exec`
      UPDATE projects
      SET compute_minutes_used = compute_minutes_used + ${minutes}
      WHERE id = ${id}
    `;

    return { success: true };
  }
);

/**
 * Get project statistics
 */
export const getProjectStats = api(
  { method: 'GET', path: '/projects/:projectId/stats' },
  async ({
    authorization,
    projectId
  }: {
    authorization: Header<'Authorization'>;
    projectId: string;
  }): Promise<{
    storageUsedBytes: bigint;
    computeMinutesUsed: number;
    deploymentStatus: string;
    createdAt: Date;
  }> => {
    const { userId } = await verifyClerkJWT(authorization);
    const id = BigInt(projectId);

    const project = await getProjectWithPermission(userId, id, 'view');

    return {
      storageUsedBytes: project.storage_used_bytes,
      computeMinutesUsed: project.compute_minutes_used,
      deploymentStatus: project.deployment_status,
      createdAt: project.created_at,
    };
  }
);
