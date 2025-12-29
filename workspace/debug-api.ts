/**
 * Debug endpoint to inspect workspace state
 * Temporary endpoint for troubleshooting
 */

import { api, Header } from 'encore.dev/api';
import { verifyClerkJWT } from '../shared/clerk-auth.js';
import { db } from './workspace-db.js';

interface DebugWorkspaceResponse {
    workspaces: Array<{
        id: string;
        projectId: string;
        name: string;
        status: string;
        daytonaSandboxId: string | null;
        language: string;
        createdAt: string;
        startedAt: string | null;
        errorMessage: string | null;
    }>;
    diagnosis: string[];
}

export const debugWorkspaces = api(
    { method: 'GET', path: '/debug/workspaces' },
    async ({ authorization }: { authorization: Header<'Authorization'> }): Promise<DebugWorkspaceResponse> => {
        // Verify auth (optional - comment out for quick debugging)
        await verifyClerkJWT(authorization);

        const workspaces: any[] = [];
        const diagnosis: string[] = [];

        // Get recent workspaces
        for await (const ws of db.query<{
            id: bigint;
            project_id: bigint;
            name: string;
            status: string;
            daytona_sandbox_id: string | null;
            language: string;
            created_at: Date;
            started_at: Date | null;
            error_message: string | null;
        }>`
      SELECT id, project_id, name, status, daytona_sandbox_id, language, created_at, started_at, error_message
      FROM workspaces
      ORDER BY created_at DESC
      LIMIT 20
    `) {
            workspaces.push({
                id: ws.id.toString(),
                projectId: ws.project_id.toString(),
                name: ws.name,
                status: ws.status,
                daytonaSandboxId: ws.daytona_sandbox_id,
                language: ws.language,
                createdAt: ws.created_at.toISOString(),
                startedAt: ws.started_at?.toISOString() || null,
                errorMessage: ws.error_message,
            });

            // Check for broken workspaces
            if (ws.status === 'running' && !ws.daytona_sandbox_id) {
                diagnosis.push(
                    `❌ Workspace ${ws.id} (Project ${ws.project_id}): Status is 'running' but missing daytona_sandbox_id. This is broken.`
                );
            }
        }

        diagnosis.push(`Total workspaces found: ${workspaces.length}`);

        return { workspaces, diagnosis };
    }
);
