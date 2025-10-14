/**
 * Clerk authentication and verification utilities
 */

import { Webhook } from 'svix';
import { createClerkClient, verifyToken } from '@clerk/backend';
import type { WebhookEvent } from '@clerk/backend';

// Initialize Clerk client
const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });

/**
 * Verify Clerk JWT token from Authorization header
 *
 * Note: Clerk's verifyToken needs the publishable key to construct the JWKS URL.
 * The JWKS URL is: https://<frontend-api>/.well-known/jwks.json
 * The frontend-api is extracted from the publishable key or secret key.
 */
export async function verifyClerkJWT(authHeader: string | undefined): Promise<{
  userId: string;
  sessionId: string;
  orgId?: string;
  orgRole?: string;
}> {
  if (!authHeader || typeof authHeader !== 'string') {
    throw new Error('Authorization header is missing');
  }

  if (!authHeader.startsWith('Bearer ')) {
    throw new Error('Invalid authorization header format');
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix

  try {
    const secretKey = process.env.CLERK_SECRET_KEY!;

    // For Clerk test keys, derive the publishable key from the secret key
    // Test keys: sk_test_xxx and pk_test_xxx both encode the instance identifier
    let publishableKey = process.env.CLERK_PUBLISHABLE_KEY;

    if (!publishableKey && secretKey && secretKey.startsWith('sk_test_')) {
      // For development, we can derive it or use the hardcoded one
      publishableKey = 'pk_test_bGlrZWQtY2F0LTg0LmNsZXJrLmFjY291bnRzLmRldiQ';
    }

    const session = await verifyToken(token, {
      secretKey,
      publishableKey,
    });

    return {
      userId: session.sub,
      sessionId: session.sid || '',
      orgId: session.org_id as string | undefined,
      orgRole: session.org_role as string | undefined,
    };
  } catch (error) {
    throw new Error(`JWT verification failed: ${error}`);
  }
}

/**
 * Verify Clerk webhook signature using Svix
 */
export function verifyClerkWebhook(
  payload: string,
  headers: Record<string, string | string[] | undefined>
): WebhookEvent {
  const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;

  if (!webhookSecret) {
    throw new Error('CLERK_WEBHOOK_SECRET is not set');
  }

  const wh = new Webhook(webhookSecret);

  try {
    // Svix headers
    const svixId = Array.isArray(headers['svix-id']) ? headers['svix-id'][0] : headers['svix-id'];
    const svixTimestamp = Array.isArray(headers['svix-timestamp']) ? headers['svix-timestamp'][0] : headers['svix-timestamp'];
    const svixSignature = Array.isArray(headers['svix-signature']) ? headers['svix-signature'][0] : headers['svix-signature'];

    if (!svixId || !svixTimestamp || !svixSignature) {
      throw new Error('Missing Svix headers');
    }

    const evt = wh.verify(payload, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as WebhookEvent;

    return evt;
  } catch (error) {
    throw new Error(`Webhook verification failed: ${error}`);
  }
}

/**
 * Check if user has permission in organization
 */
export async function checkOrganizationPermission(
  userId: string,
  orgId: string,
  requiredRole: 'org:owner' | 'org:admin' | 'org:developer' | 'org:viewer'
): Promise<boolean> {
  try {
    const membership = await clerkClient.organizations.getOrganizationMembership({
      organizationId: orgId,
      userId: userId,
    });

    const roleHierarchy: Record<string, number> = {
      'org:owner': 4,
      'org:admin': 3,
      'org:developer': 2,
      'org:viewer': 1,
    };

    const userRoleLevel = roleHierarchy[membership.role as string] || 0;
    const requiredRoleLevel = roleHierarchy[requiredRole] || 0;

    return userRoleLevel >= requiredRoleLevel;
  } catch (error) {
    return false;
  }
}

/**
 * Get user's subscription tier from Clerk metadata
 */
export async function getUserSubscriptionTier(userId: string): Promise<string> {
  try {
    const user = await clerkClient.users.getUser(userId);
    return (user.publicMetadata?.subscriptionTier as string) || 'free';
  } catch (error) {
    return 'free';
  }
}

/**
 * Get organization's subscription tier from Clerk metadata
 */
export async function getOrgSubscriptionTier(orgId: string): Promise<string> {
  try {
    const org = await clerkClient.organizations.getOrganization({
      organizationId: orgId,
    });
    return (org.publicMetadata?.subscriptionTier as string) || 'team';
  } catch (error) {
    return 'team';
  }
}
