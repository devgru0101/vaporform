#!/usr/bin/env npx tsx

/**
 * Debug script to inspect workspace state in database
 */

import { db } from '../workspace/workspace-db.js';

async function main() {
    console.log('=== Workspace Debug Inspector ===\n');

    try {
        // Get all workspaces
        const workspaces: any[] = [];
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
      LIMIT 10
    `) {
            workspaces.push(ws);
        }

        console.log(`Found ${workspaces.length} workspaces:\n`);

        workspaces.forEach((ws, idx) => {
            console.log(`[${idx + 1}] Workspace ID: ${ws.id}`);
            console.log(`    Project ID: ${ws.project_id}`);
            console.log(`    Name: ${ws.name}`);
            console.log(`    Status: ${ws.status}`);
            console.log(`    Daytona Sandbox ID: ${ws.daytona_sandbox_id || '❌ NULL (MISSING!)'}`);
            console.log(`    Language: ${ws.language}`);
            console.log(`    Created: ${ws.created_at}`);
            console.log(`    Started: ${ws.started_at || 'Never started'}`);
            if (ws.error_message) {
                console.log(`    ⚠️  Error: ${ws.error_message}`);
            }
            console.log('');
        });

        // Specific check for workspace 6
        const ws6 = workspaces.find(ws => ws.id.toString() === '6');
        if (ws6) {
            console.log('=== WORKSPACE 6 (Project 1) DIAGNOSIS ===');
            if (!ws6.daytona_sandbox_id) {
                console.log('❌ CONFIRMED: Workspace 6 is missing daytona_sandbox_id');
                console.log('   This explains why the agent cannot create files or execute commands.');
                console.log('   The workspace thinks it\'s "running" but has no actual Daytona sandbox.');
            } else {
                console.log('✓ Workspace 6 has sandbox ID:', ws6.daytona_sandbox_id);
            }
        } else {
            console.log('⚠️  Workspace 6 not found in recent workspaces');
        }

    } catch (error) {
        console.error('Error querying database:', error);
        process.exit(1);
    }
}

main();
