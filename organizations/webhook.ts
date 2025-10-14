/**
 * Clerk organization webhook handler
 * Syncs organization and membership data from Clerk to PostgreSQL
 */

import { api } from 'encore.dev/api';
import { verifyClerkWebhook } from '../shared/clerk-auth.js';
import { db } from './db.js';

/**
 * Webhook endpoint for Clerk organization events
 *
 * Setup in Clerk Dashboard:
 * 1. Go to Webhooks section
 * 2. Add endpoint: https://your-api.com/webhooks/clerk/organization
 * 3. Subscribe to events:
 *    - organization.created
 *    - organization.updated
 *    - organization.deleted
 *    - organizationMembership.created
 *    - organizationMembership.updated
 *    - organizationMembership.deleted
 */
export const clerkOrgWebhook = api.raw(
  { expose: true, path: '/webhooks/clerk/organization', method: 'POST' },
  async (req, resp) => {
    try {
      const body = await req.text();
      const headers: Record<string, string> = {};
      req.headers.forEach((value, key) => {
        headers[key] = value;
      });

      const evt = verifyClerkWebhook(body, headers);
      console.log(`Received Clerk org webhook: ${evt.type}`);

      switch (evt.type) {
        case 'organization.created': {
          const { id, name, slug, image_url, max_allowed_memberships } = evt.data;

          await db.exec`
            INSERT INTO organizations (
              clerk_org_id,
              name,
              slug,
              logo_url,
              subscription_tier,
              max_members
            ) VALUES (
              ${id},
              ${name},
              ${slug},
              ${image_url || null},
              'team',
              ${max_allowed_memberships || -1}
            )
            ON CONFLICT (clerk_org_id) DO NOTHING
          `;

          console.log(`✓ Created organization: ${name} (${id})`);
          break;
        }

        case 'organization.updated': {
          const { id, name, slug, image_url, max_allowed_memberships } = evt.data;

          await db.exec`
            UPDATE organizations
            SET
              name = ${name},
              slug = ${slug},
              logo_url = ${image_url || null},
              max_members = ${max_allowed_memberships || -1},
              updated_at = NOW()
            WHERE clerk_org_id = ${id}
          `;

          console.log(`✓ Updated organization: ${name} (${id})`);
          break;
        }

        case 'organization.deleted': {
          const { id } = evt.data;

          await db.exec`
            UPDATE organizations
            SET deleted_at = NOW()
            WHERE clerk_org_id = ${id}
          `;

          console.log(`✓ Deleted organization: ${id}`);
          break;
        }

        case 'organizationMembership.created': {
          const { id, organization, public_user_data, role } = evt.data;

          // Get org ID from database
          const org = await db.queryRow<{ id: bigint }>`
            SELECT id FROM organizations
            WHERE clerk_org_id = ${organization.id}
          `;

          // Get user ID from database
          const user = await db.queryRow<{ id: bigint }>`
            SELECT id FROM users
            WHERE clerk_user_id = ${public_user_data.user_id}
          `;

          if (org && user) {
            await db.exec`
              INSERT INTO organization_members (
                org_id,
                user_id,
                clerk_org_id,
                clerk_user_id,
                role
              ) VALUES (
                ${org.id},
                ${user.id},
                ${organization.id},
                ${public_user_data.user_id},
                ${role}
              )
              ON CONFLICT (org_id, user_id)
              DO UPDATE SET
                role = ${role},
                updated_at = NOW()
            `;

            console.log(`✓ Added member ${public_user_data.user_id} to org ${organization.id} as ${role}`);
          } else {
            console.warn(`⚠ Could not find org or user for membership ${id}`);
          }
          break;
        }

        case 'organizationMembership.updated': {
          const { organization, public_user_data, role } = evt.data;

          await db.exec`
            UPDATE organization_members
            SET
              role = ${role},
              updated_at = NOW()
            WHERE clerk_org_id = ${organization.id}
            AND clerk_user_id = ${public_user_data.user_id}
          `;

          console.log(`✓ Updated member ${public_user_data.user_id} role to ${role} in org ${organization.id}`);
          break;
        }

        case 'organizationMembership.deleted': {
          const { organization, public_user_data } = evt.data;

          await db.exec`
            DELETE FROM organization_members
            WHERE clerk_org_id = ${organization.id}
            AND clerk_user_id = ${public_user_data.user_id}
          `;

          console.log(`✓ Removed member ${public_user_data.user_id} from org ${organization.id}`);
          break;
        }

        default:
          console.log(`Unhandled event type: ${evt.type}`);
      }

      resp.writeHead(200, { 'Content-Type': 'application/json' });
      resp.end(JSON.stringify({ success: true, type: evt.type }));

    } catch (error) {
      console.error('Webhook error:', error);
      resp.writeHead(400, { 'Content-Type': 'application/json' });
      resp.end(JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false
      }));
    }
  }
);
