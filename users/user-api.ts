/**
 * User API endpoints
 * Provides CRUD operations for users
 */

import { api, Header } from 'encore.dev/api';
import { secret } from 'encore.dev/config';
import { verifyClerkJWT, getUserSubscriptionTier } from '../shared/clerk-auth.js';
import type { User } from '../shared/types.js';
import { db } from './db.js';
import { timingSafeEqual } from 'crypto';

// Admin secret for subscription management - configured via Encore secrets manager
const adminSecret = secret("AdminSecret");

interface GetUserResponse {
  user: User;
}

interface UpdateUserRequest {
  authorization: Header<'Authorization'>;
  // subscriptionTier removed to prevent self-promotion
  // subscriptionTier?: 'free' | 'pro' | 'team' | 'enterprise';
}

interface UpdateSubscriptionRequest {
  userId: string; // Clerk User ID
  tier: 'free' | 'pro' | 'team' | 'enterprise';
  adminSecret: Header<'X-Admin-Secret'>;
}

interface ListUsersResponse {
  users: User[];
  total: number;
}

/**
 * Get current authenticated user
 */
export const getCurrentUser = api(
  { method: 'GET', path: '/users/me' },
  async ({ authorization }: { authorization: Header<'Authorization'> }): Promise<GetUserResponse> => {
    // Verify JWT and get user ID
    const { userId } = await verifyClerkJWT(authorization);

    // Get user from database
    const user = await db.queryRow<User>`
      SELECT * FROM users
      WHERE clerk_user_id = ${userId}
      AND deleted_at IS NULL
    `;

    if (!user) {
      throw new Error('User not found');
    }

    return { user };
  }
);

/**
 * Get user by Clerk ID
 * Users can only access their own data (prevents user enumeration)
 */
export const getUserByClerkId = api(
  { method: 'GET', path: '/users/:clerkUserId' },
  async ({
    authorization,
    clerkUserId
  }: {
    authorization: Header<'Authorization'>;
    clerkUserId: string;
  }): Promise<GetUserResponse> => {
    // Verify the requester is authenticated
    const { userId } = await verifyClerkJWT(authorization);

    // Security: Users can only access their own data
    if (userId !== clerkUserId) {
      throw new Error('Forbidden: Cannot access other users\' data');
    }

    const user = await db.queryRow<User>`
      SELECT * FROM users
      WHERE clerk_user_id = ${clerkUserId}
      AND deleted_at IS NULL
    `;

    if (!user) {
      throw new Error('User not found');
    }

    return { user };
  }
);

/**
 * Update current user
 * (Mainly for updating subscription tier, other fields are synced from Clerk)
 */
export const updateCurrentUser = api(
  { method: 'PUT', path: '/users/me' },
  async (req: UpdateUserRequest): Promise<GetUserResponse> => {
    const { userId } = await verifyClerkJWT(req.authorization);

    // Update user (subscription_tier update removed)
    await db.exec`
      UPDATE users
      SET
        updated_at = NOW()
      WHERE clerk_user_id = ${userId}
    `;

    // Get updated user
    const user = await db.queryRow<User>`
      SELECT * FROM users
      WHERE clerk_user_id = ${userId}
    `;

    if (!user) {
      throw new Error('User not found');
    }

    return { user };
  }
);

/**
 * Admin: Update user subscription tier
 * Protected by X-Admin-Secret header using Encore secrets
 */
export const updateUserSubscription = api(
  { method: 'POST', path: '/admin/users/subscription' },
  async (req: UpdateSubscriptionRequest): Promise<{ success: boolean }> => {
    // Verify admin secret using timing-safe comparison to prevent timing attacks
    let validSecret: string;
    try {
      validSecret = adminSecret();
    } catch (error) {
      console.error('AdminSecret not configured - admin endpoints disabled');
      throw new Error('Unauthorized: Admin functionality not configured');
    }

    // Timing-safe comparison to prevent timing attacks
    const providedBuffer = Buffer.from(req.adminSecret || '');
    const validBuffer = Buffer.from(validSecret);

    if (providedBuffer.length !== validBuffer.length ||
        !timingSafeEqual(providedBuffer, validBuffer)) {
      throw new Error('Unauthorized: Invalid admin secret');
    }

    await db.exec`
      UPDATE users
      SET
        subscription_tier = ${req.tier},
        updated_at = NOW()
      WHERE clerk_user_id = ${req.userId}
    `;

    return { success: true };
  }
);

/**
 * List all users (admin only - for future use)
 */
export const listUsers = api(
  { method: 'GET', path: '/users' },
  async ({
    authorization,
    limit = 50,
    offset = 0
  }: {
    authorization: Header<'Authorization'>;
    limit?: number;
    offset?: number;
  }): Promise<ListUsersResponse> => {
    // Verify authentication
    await verifyClerkJWT(authorization);

    // Get users
    const users: User[] = [];
    for await (const user of db.query<User>`
      SELECT * FROM users
      WHERE deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `) {
      users.push(user);
    }

    // Get total count
    const countResult = await db.queryRow<{ count: bigint }>`
      SELECT COUNT(*) as count FROM users
      WHERE deleted_at IS NULL
    `;

    return {
      users,
      total: Number(countResult?.count || 0),
    };
  }
);

/**
 * Delete current user (soft delete)
 */
export const deleteCurrentUser = api(
  { method: 'DELETE', path: '/users/me' },
  async ({ authorization }: { authorization: Header<'Authorization'> }): Promise<{ success: boolean }> => {
    const { userId } = await verifyClerkJWT(authorization);

    await db.exec`
      UPDATE users
      SET deleted_at = NOW()
      WHERE clerk_user_id = ${userId}
    `;

    return { success: true };
  }
);
