/**
 * Clerk Initialization Helper
 *
 * Each Encore service that uses Clerk must call initClerk() to initialize the shared Clerk client.
 * This must be done BEFORE any Clerk functions are called.
 *
 * Usage in your service:
 * ```typescript
 * import { secret } from 'encore.dev/config';
 * import { initClerk } from '../shared/clerk-init.js';
 *
 * // Define secrets in your service
 * const clerkSecretKey = secret("ClerkSecretKey");
 * const clerkPublishableKey = secret("ClerkPublishableKey");
 * const clerkWebhookSecret = secret("ClerkWebhookSecret");
 *
 * // Initialize Clerk (call once per service)
 * initClerk(clerkSecretKey(), clerkPublishableKey(), clerkWebhookSecret());
 * ```
 */

import { initializeClerk } from './clerk-auth.js';

let initialized = false;

/**
 * Initialize Clerk with secrets from the calling service
 * Safe to call multiple times (only initializes once)
 */
export function initClerk(secretKey: string, publishableKey: string, webhookSecret: string) {
  if (!initialized) {
    initializeClerk(secretKey, publishableKey, webhookSecret);
    initialized = true;
  }
}
