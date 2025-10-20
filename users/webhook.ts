/**
 * Clerk user webhook handler
 * Syncs user data from Clerk to PostgreSQL
 */

import { api } from 'encore.dev/api';
import { verifyClerkWebhook } from '../shared/clerk-auth.js';
import { db } from './db.js';

/**
 * Webhook endpoint for Clerk user events
 * This endpoint receives webhooks from Clerk when users are created, updated, or deleted
 *
 * Setup in Clerk Dashboard:
 * 1. Go to Webhooks section
 * 2. Add endpoint: https://your-api.com/webhooks/clerk/user
 * 3. Subscribe to events: user.created, user.updated, user.deleted
 * 4. Copy the signing secret to CLERK_WEBHOOK_SECRET env var
 */
export const clerkUserWebhook = api.raw(
  { expose: true, path: '/webhooks/clerk/user', method: 'POST' },
  async (req, resp) => {
    try {
      // Read body from IncomingMessage stream
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(Buffer.from(chunk));
      }
      const body = Buffer.concat(chunks).toString('utf-8');

      // Get headers as a plain object
      const headers: Record<string, string> = {};
      Object.entries(req.headers).forEach(([key, value]: [string, any]) => {
        if (typeof value === 'string') {
          headers[key] = value;
        } else if (Array.isArray(value)) {
          headers[key] = value[0];
        }
      });

      // Verify the webhook signature
      const evt = verifyClerkWebhook(body, headers);

      console.log(`Received Clerk webhook: ${evt.type}`);

      // Handle different event types
      switch (evt.type) {
        case 'user.created': {
          const { id, email_addresses, first_name, last_name, image_url } = evt.data;
          const email = email_addresses?.[0]?.email_address || '';

          await db.exec`
            INSERT INTO users (
              clerk_user_id,
              email,
              first_name,
              last_name,
              avatar_url,
              subscription_tier
            ) VALUES (
              ${id},
              ${email},
              ${first_name || null},
              ${last_name || null},
              ${image_url || null},
              'free'
            )
            ON CONFLICT (clerk_user_id) DO NOTHING
          `;

          console.log(`✓ Created user: ${email} (${id})`);
          break;
        }

        case 'user.updated': {
          const { id, email_addresses, first_name, last_name, image_url } = evt.data;
          const email = email_addresses?.[0]?.email_address || '';

          await db.exec`
            UPDATE users
            SET
              email = ${email},
              first_name = ${first_name || null},
              last_name = ${last_name || null},
              avatar_url = ${image_url || null},
              updated_at = NOW()
            WHERE clerk_user_id = ${id}
          `;

          console.log(`✓ Updated user: ${email} (${id})`);
          break;
        }

        case 'user.deleted': {
          const { id } = evt.data;

          // Soft delete - keep the record but mark as deleted
          await db.exec`
            UPDATE users
            SET deleted_at = NOW()
            WHERE clerk_user_id = ${id}
          `;

          console.log(`✓ Deleted user: ${id}`);
          break;
        }

        default:
          console.log(`Unhandled event type: ${evt.type}`);
      }

      // Return success response
      resp.writeHead(200, { 'Content-Type': 'application/json' });
      resp.end(JSON.stringify({ success: true, type: evt.type }));

    } catch (error) {
      console.error('Webhook error:', error);

      // Return error response
      resp.writeHead(400, { 'Content-Type': 'application/json' });
      resp.end(JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false
      }));
    }
  }
);
