/**
 * RBAC permission checking for projects
 */

import { checkOrganizationPermission, getUserSubscriptionTier } from '../shared/clerk-auth.js';
import type { Project } from '../shared/types.js';
import { ForbiddenError, NotFoundError, toAPIError } from '../shared/errors.js';
import { db } from './db.js';

/**
 * Permission types for projects
 */
export type ProjectPermission = 'view' | 'edit' | 'delete' | 'deploy';

/**
 * Role hierarchy mapping
 * Higher number = more permissions
 */
const ROLE_HIERARCHY: Record<string, number> = {
  'org:owner': 4,
  'org:admin': 3,
  'org:developer': 2,
  'org:viewer': 1,
};

/**
 * Required role for each permission
 */
const PERMISSION_REQUIREMENTS: Record<ProjectPermission, string[]> = {
  view: ['org:viewer', 'org:developer', 'org:admin', 'org:owner'],
  edit: ['org:developer', 'org:admin', 'org:owner'],
  delete: ['org:admin', 'org:owner'],
  deploy: ['org:developer', 'org:admin', 'org:owner'],
};

/**
 * Check if user has permission for a project
 */
export async function checkProjectPermission(
  userId: string,
  projectId: bigint,
  permission: ProjectPermission
): Promise<boolean> {
  // Get project
  const project = await db.queryRow<Project>`
    SELECT * FROM projects
    WHERE id = ${projectId}
    AND deleted_at IS NULL
  `;

  if (!project) {
    return false;
  }

  // Personal project - check ownership
  if (!project.clerk_org_id) {
    return project.clerk_user_id === userId;
  }

  // Organization project - check org membership and role
  const requiredRoles = PERMISSION_REQUIREMENTS[permission];

  for (const role of requiredRoles) {
    const hasRole = await checkOrganizationPermission(
      userId,
      project.clerk_org_id,
      role as any
    );

    if (hasRole) {
      return true;
    }
  }

  return false;
}

/**
 * Ensure user has permission or throw error
 */
/**
 * Ensure user has permission or throw error
 */
export async function ensureProjectPermission(
  userId: string,
  projectId: bigint,
  permission: ProjectPermission
): Promise<void> {
  try {
    // Check existence first to distinguish 404 from 403
    const project = await db.queryRow<{ clerk_org_id: string | null; clerk_user_id: string }>`
      SELECT clerk_org_id, clerk_user_id FROM projects
      WHERE id = ${projectId}
      AND deleted_at IS NULL
    `;

    if (!project) {
      throw new NotFoundError('Project not found');
    }

    // Personal project - check ownership
    if (!project.clerk_org_id) {
      if (project.clerk_user_id === userId) return;
      throw new ForbiddenError(`Insufficient permissions for project operation: ${permission}`);
    }

    // Organization project - check org membership and role
    const requiredRoles = PERMISSION_REQUIREMENTS[permission];

    for (const role of requiredRoles) {
      const hasRole = await checkOrganizationPermission(
        userId,
        project.clerk_org_id,
        role as any
      );

      if (hasRole) {
        return;
      }
    }

    throw new ForbiddenError(`Insufficient permissions for project operation: ${permission}`);
  } catch (error) {
    if (error instanceof ForbiddenError || error instanceof NotFoundError) {
      // Import needed dynamically or at top level to avoid circular deps if possible, 
      // but here we just need to import toAPIError at top of file.
      // Assuming toAPIError handles the conversion.
      throw toAPIError(error);
    }
    throw error;
  }
}

/**
 * Get project with permission check
 */
export async function getProjectWithPermission(
  userId: string,
  projectId: bigint,
  permission: ProjectPermission = 'view'
): Promise<Project> {
  const project = await db.queryRow<Project>`
    SELECT * FROM projects
    WHERE id = ${projectId}
    AND deleted_at IS NULL
  `;

  if (!project) {
    throw new Error('Project not found');
  }

  await ensureProjectPermission(userId, projectId, permission);

  return project;
}

/**
 * Check if user can create projects based on subscription tier
 */
export async function checkProjectCreationLimit(
  userId: string,
  orgId?: string
): Promise<{ allowed: boolean; reason?: string; currentCount: number; maxCount: number }> {
  // Get user's subscription tier from Clerk metadata
  // This avoids cross-service database queries which aren't supported in Encore
  const subscriptionTier = await getUserSubscriptionTier(userId);

  // Define limits per tier
  const limits: Record<string, number> = {
    free: 3,
    pro: Infinity,
    team: Infinity,
    enterprise: Infinity,
  };

  const maxCount = limits[subscriptionTier] || 3;

  // Count existing projects
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

  const result = await countQuery;
  const currentCount = Number(result?.count || 0);

  if (currentCount >= maxCount) {
    return {
      allowed: false,
      reason: `Project limit reached. Your ${subscriptionTier} tier allows ${maxCount} projects. Upgrade to create more.`,
      currentCount,
      maxCount,
    };
  }

  return { allowed: true, currentCount, maxCount };
}
