/**
 * Clerk authentication and verification utilities
 *
 * Uses Encore secrets for all Clerk credentials:
 * - ClerkSecretKey: Backend authentication
 * - ClerkPublishableKey: Frontend authentication
 * - ClerkWebhookSecret: Webhook verification
 */

import { Webhook } from 'svix';
import { createClerkClient, verifyToken } from '@clerk/backend';
import type { WebhookEvent } from '@clerk/backend';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { webcrypto } from 'node:crypto';

// Polyfill crypto for jose in Node.js 18
if (!globalThis.crypto) {
  // @ts-ignore
  globalThis.crypto = webcrypto;
}

/**
 * IMPORTANT: Clerk secrets must be defined in each service that uses this module.
 * The shared/clerk-auth.ts module cannot define secrets because it's not within a service directory.
 *
 * In your service, define these secrets:
 * ```typescript
 * import { secret } from 'encore.dev/config';
 * const clerkSecretKey = secret("ClerkSecretKey");
 * const clerkPublishableKey = secret("ClerkPublishableKey");
 * const clerkWebhookSecret = secret("ClerkWebhookSecret");
 * ```
 *
 * Then pass them to the functions in this module via the new exported functions.
 */

// Lazy initialization of Clerk client
let clerkClient: ReturnType<typeof createClerkClient> | null = null;
let cachedPublishableKey: string | null = null;
let cachedWebhookSecret: string | null = null;

/**
 * Initialize Clerk authentication with secrets from calling service
 * Must be called before using other functions in this module
 */
export function initializeClerk(secretKey: string, publishableKey: string, webhookSecret: string) {
  if (!clerkClient) {
    clerkClient = createClerkClient({ secretKey });
    cachedPublishableKey = publishableKey;
    cachedWebhookSecret = webhookSecret;
  }
}

function getClerkClient() {
  if (!clerkClient) {
    throw new Error('Clerk not initialized. Call initializeClerk() first from your service.');
  }
  return clerkClient;
}

function getPublishableKey(): string {
  if (!cachedPublishableKey) {
    throw new Error('Clerk not initialized. Call initializeClerk() first from your service.');
  }
  return cachedPublishableKey;
}

function getWebhookSecret(): string {
  if (!cachedWebhookSecret) {
    throw new Error('Clerk not initialized. Call initializeClerk() first from your service.');
  }
  return cachedWebhookSecret;
}

/**
 * Get Clerk instance JWKS URL
 * Derives the JWKS URL from the publishable key
 */
function getClerkJWKSURL(): string {
  const publishableKey = getPublishableKey();

  // Extract instance from publishable key
  // Format: pk_test_{instance} or pk_live_{instance}
  // Instance pattern: {slug}.clerk.accounts.dev
  const match = publishableKey.match(/pk_(test|live)_(.+)/);
  if (!match) {
    throw new Error('Invalid Clerk publishable key format');
  }

  // Decode the base64-encoded instance
  try {
    const encodedInstance = match[2];
    const instance = Buffer.from(encodedInstance, 'base64').toString('utf-8');

    // Remove trailing $ if present
    const cleanInstance = instance.replace(/\$+$/, '');

    return `https://${cleanInstance}/.well-known/jwks.json`;
  } catch (error) {
    // Fallback: assume the publishable key itself contains the instance
    throw new Error('Could not derive JWKS URL from Clerk publishable key');
  }
}

// Lazy initialization of JWKS
let JWKS: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJWKS() {
  if (!JWKS) {
    const jwksURL = getClerkJWKSURL();
    JWKS = createRemoteJWKSet(new URL(jwksURL));
  }
  return JWKS;
}

/**
 * Verify Clerk JWT token from Authorization header
 *
 * Uses Clerk's built-in verifyToken which handles JWKS fetching internally
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
    // Use jose library for JWT verification with Clerk JWKS
    // This is more reliable than Clerk's verifyToken for Encore environments
    const jwks = getJWKS();

    // Get the issuer from the publishable key
    const publishableKey = getPublishableKey();
    const match = publishableKey.match(/pk_(test|live)_(.+)/);
    if (!match) {
      throw new Error('Invalid Clerk publishable key format');
    }
    const encodedInstance = match[2];
    const instance = Buffer.from(encodedInstance, 'base64').toString('utf-8');
    const cleanInstance = instance.replace(/\$+$/, '');
    const issuer = `https://${cleanInstance}`;

    console.log('[Clerk Auth] Verifying JWT with issuer:', issuer);
    console.log('[Clerk Auth] Token preview:', token.substring(0, 50) + '...');

    const { payload } = await jwtVerify(token, jwks, {
      issuer: issuer,
    });

    console.log('[Clerk Auth] JWT verified successfully for user:', payload.sub);

    return {
      userId: payload.sub || '',
      sessionId: (payload.sid as string) || '',
      orgId: (payload.org_id as string) || undefined,
      orgRole: (payload.org_role as string) || undefined,
    };
  } catch (error) {
    console.error('[Clerk Auth] JWT verification error details:', error);
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
  const webhookSecret = getWebhookSecret();

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
    const client = getClerkClient();
    // Clerk API updated - getOrganizationMembership renamed to getOrganizationMembershipList
    const membershipList = await client.organizations.getOrganizationMembershipList({
      organizationId: orgId,
    });

    // Find the user's membership
    const membership = membershipList.data.find((m: any) => m.publicUserData.userId === userId);
    if (!membership) {
      return false;
    }

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
    const client = getClerkClient();
    const user = await client.users.getUser(userId);
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
    const client = getClerkClient();
    const org = await client.organizations.getOrganization({
      organizationId: orgId,
    });
    return (org.publicMetadata?.subscriptionTier as string) || 'team';
  } catch (error) {
    return 'team';
  }
}
