/**
 * Organization API endpoints
 */

import { api, Header } from 'encore.dev/api';
import { verifyClerkJWT, checkOrganizationPermission } from '../shared/clerk-auth.js';
import type { Organization, OrganizationMember } from '../shared/types.js';
import { ForbiddenError, NotFoundError, toAPIError } from '../shared/errors.js';
import { db } from './db.js';

interface GetOrganizationResponse {
  organization: Organization;
  members?: OrganizationMember[];
}

interface ListOrganizationsResponse {
  organizations: Organization[];
}

interface GetMembershipResponse {
  membership: OrganizationMember;
}

/**
 * Get organization by Clerk org ID
 */
export const getOrganization = api(
  { method: 'GET', path: '/organizations/:clerkOrgId' },
  async ({
    authorization,
    clerkOrgId,
    includeMembers = false
  }: {
    authorization: Header<'Authorization'>;
    clerkOrgId: string;
    includeMembers?: boolean;
  }): Promise<GetOrganizationResponse> => {
    const { userId } = await verifyClerkJWT(authorization);

    // Check if user is member of this org
    const isMember = await checkOrganizationPermission(userId, clerkOrgId, 'org:viewer');
    if (!isMember) {
      throw toAPIError(new ForbiddenError('Not a member of this organization'));
    }

    // Get organization
    const organization = await db.queryRow<Organization>`
      SELECT * FROM organizations
      WHERE clerk_org_id = ${clerkOrgId}
      AND deleted_at IS NULL
    `;

    if (!organization) {
      throw toAPIError(new NotFoundError('Organization not found'));
    }

    let members: OrganizationMember[] | undefined;

    if (includeMembers) {
      members = [];
      for await (const member of db.query<OrganizationMember>`
        SELECT * FROM organization_members
        WHERE org_id = ${organization.id}
        ORDER BY created_at ASC
      `) {
        members.push(member);
      }
    }

    return { organization, members };
  }
);

/**
 * List organizations for current user
 */
export const listMyOrganizations = api(
  { method: 'GET', path: '/organizations' },
  async ({ authorization }: { authorization: Header<'Authorization'> }): Promise<ListOrganizationsResponse> => {
    const { userId } = await verifyClerkJWT(authorization);

    // Get user's internal ID
    const user = await db.queryRow<{ id: bigint }>`
      SELECT id FROM users
      WHERE clerk_user_id = ${userId}
    `;

    if (!user) {
      return { organizations: [] };
    }

    // Get organizations user is a member of
    const organizations: Organization[] = [];
    for await (const org of db.query<Organization>`
      SELECT o.*
      FROM organizations o
      INNER JOIN organization_members om ON o.id = om.org_id
      WHERE om.user_id = ${user.id}
      AND o.deleted_at IS NULL
      ORDER BY o.created_at DESC
    `) {
      organizations.push(org);
    }

    return { organizations };
  }
);

/**
 * Get organization members
 */
export const getOrganizationMembers = api(
  { method: 'GET', path: '/organizations/:clerkOrgId/members' },
  async ({
    authorization,
    clerkOrgId
  }: {
    authorization: Header<'Authorization'>;
    clerkOrgId: string;
  }): Promise<{ members: OrganizationMember[] }> => {
    const { userId } = await verifyClerkJWT(authorization);

    // Check if user is member
    const isMember = await checkOrganizationPermission(userId, clerkOrgId, 'org:viewer');
    if (!isMember) {
      throw toAPIError(new ForbiddenError('Not a member of this organization'));
    }

    // Get org ID
    const org = await db.queryRow<{ id: bigint }>`
      SELECT id FROM organizations
      WHERE clerk_org_id = ${clerkOrgId}
    `;

    if (!org) {
      throw toAPIError(new NotFoundError('Organization not found'));
    }

    // Get members
    const members: OrganizationMember[] = [];
    for await (const member of db.query<OrganizationMember>`
      SELECT * FROM organization_members
      WHERE org_id = ${org.id}
      ORDER BY role DESC, created_at ASC
    `) {
      members.push(member);
    }

    return { members };
  }
);

/**
 * Get current user's membership in an organization
 */
export const getMyMembership = api(
  { method: 'GET', path: '/organizations/:clerkOrgId/membership' },
  async ({
    authorization,
    clerkOrgId
  }: {
    authorization: Header<'Authorization'>;
    clerkOrgId: string;
  }): Promise<GetMembershipResponse> => {
    const { userId } = await verifyClerkJWT(authorization);

    const membership = await db.queryRow<OrganizationMember>`
      SELECT * FROM organization_members
      WHERE clerk_org_id = ${clerkOrgId}
      AND clerk_user_id = ${userId}
    `;

    if (!membership) {
      throw toAPIError(new NotFoundError('Membership not found'));
    }

    return { membership };
  }
);

/**
 * Check if user has specific role in organization
 */
export const checkRole = api(
  { method: 'GET', path: '/organizations/:clerkOrgId/check-role' },
  async ({
    authorization,
    clerkOrgId,
    requiredRole
  }: {
    authorization: Header<'Authorization'>;
    clerkOrgId: string;
    requiredRole: 'org:owner' | 'org:admin' | 'org:developer' | 'org:viewer';
  }): Promise<{ hasPermission: boolean }> => {
    const { userId } = await verifyClerkJWT(authorization);

    const hasPermission = await checkOrganizationPermission(userId, clerkOrgId, requiredRole);

    return { hasPermission };
  }
);
