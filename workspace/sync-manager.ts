/**
 * VFS ↔ Daytona Bidirectional Sync Manager
 * Prevents file desynchronization and data loss
 */

import { gridfs } from '../vfs/gridfs.js';
import { daytonaManager } from './daytona-manager.js';
import { db } from './daytona-manager.js';
import { escapeShellArg } from '../shared/validation.js';
import { TIMEOUTS, RETRY } from '../shared/config.js';

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('[Sync Manager] SIGTERM received, cleaning up...');
  syncManager.cleanup();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[Sync Manager] SIGINT received, cleaning up...');
  syncManager.cleanup();
  process.exit(0);
});

interface SyncState {
  projectId: bigint;
  workspaceId: bigint;
  vfsInterval?: NodeJS.Timeout;
  daytonaInterval?: NodeJS.Timeout;
  lastVFSSync: Date;
  lastDaytonaSync: Date;
  isActive: boolean;
}

export class SyncManager {
  private syncStates = new Map<string, SyncState>();
  private readonly SYNC_INTERVAL_MS = TIMEOUTS.SYNC_INTERVAL;
  private readonly DEBOUNCE_MS = TIMEOUTS.SYNC_DEBOUNCE;

  /**
   * Wait for workspace to have a Daytona sandbox ID with exponential backoff
   * Prevents race condition where sync starts before workspace creation completes
   */
  private async waitForSandboxId(workspaceId: bigint): Promise<boolean> {
    const maxRetries = 10; // Max ~30 seconds total (1+2+4+8+16=31s)
    let retries = 0;
    let waitTime = 1000; // Start with 1 second

    while (retries < maxRetries) {
      try {
        const workspace = await daytonaManager.getWorkspace(workspaceId);

        if (workspace.daytona_sandbox_id) {
          console.log(`[Sync Manager] ✓ Sandbox ID ready for workspace ${workspaceId} after ${retries} retries`);
          return true;
        }

        // Not ready yet - wait with exponential backoff
        console.log(`[Sync Manager] Waiting for sandbox ID (retry ${retries + 1}/${maxRetries}, wait ${waitTime}ms)...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));

        retries++;
        waitTime = Math.min(waitTime * 2, 5000); // Cap at 5 seconds
      } catch (error) {
        console.error(`[Sync Manager] Error checking sandbox ID:`, error);
        retries++;
        await new Promise(resolve => setTimeout(resolve, waitTime));
        waitTime = Math.min(waitTime * 2, 5000);
      }
    }

    return false; // Timeout
  }

  /**
   * Start bidirectional sync for a project
   */
  async startSync(projectId: bigint, workspaceId: bigint): Promise<void> {
    const key = `${projectId}`;

    // Stop existing sync if any
    if (this.syncStates.has(key)) {
      await this.stopSync(projectId);
    }

    console.log(`[Sync Manager] Starting bidirectional sync for project ${projectId}`);

    // CRITICAL FIX: Wait for workspace to have Daytona sandbox ID before starting sync
    // This prevents race condition where sync starts before workspace creation completes
    const sandboxReady = await this.waitForSandboxId(workspaceId);
    if (!sandboxReady) {
      console.error(`[Sync Manager] Timeout waiting for sandbox ID for workspace ${workspaceId}`);
      throw new Error('Workspace sandbox creation timeout - cannot start sync');
    }

    const state: SyncState = {
      projectId,
      workspaceId,
      lastVFSSync: new Date(Date.now() - 60000), // Start 1 min back to catch recent changes
      lastDaytonaSync: new Date(Date.now() - 60000),
      isActive: true
    };

    // Initial full sync to ensure everything is in sync
    try {
      await this.fullSync(projectId, workspaceId, 'to-daytona');
      console.log(`[Sync Manager] Initial sync to Daytona completed`);
    } catch (error) {
      console.error(`[Sync Manager] Initial sync failed:`, error);
    }

    // VFS → Daytona sync (every 5 seconds)
    state.vfsInterval = setInterval(async () => {
      if (state.isActive) {
        try {
          await this.syncVFSToDaytona(state);
        } catch (error) {
          console.error('[Sync Manager] VFS→Daytona failed:', error);
        }
      }
    }, this.SYNC_INTERVAL_MS);

    // Daytona → VFS sync (every 5 seconds)
    state.daytonaInterval = setInterval(async () => {
      if (state.isActive) {
        try {
          await this.syncDaytonaToVFS(state);
        } catch (error) {
          console.error('[Sync Manager] Daytona→VFS failed:', error);
        }
      }
    }, this.SYNC_INTERVAL_MS);

    this.syncStates.set(key, state);
    console.log(`[Sync Manager] Sync intervals started for project ${projectId}`);
  }

  /**
   * Stop sync for a project
   */
  async stopSync(projectId: bigint): Promise<void> {
    const key = `${projectId}`;
    const state = this.syncStates.get(key);

    if (state) {
      console.log(`[Sync Manager] Stopping sync for project ${projectId}`);
      state.isActive = false;

      if (state.vfsInterval) {
        clearInterval(state.vfsInterval);
      }
      if (state.daytonaInterval) {
        clearInterval(state.daytonaInterval);
      }

      this.syncStates.delete(key);
      console.log(`[Sync Manager] Sync stopped for project ${projectId}`);
    }
  }

  /**
   * Pause sync temporarily (useful during large operations)
   */
  pauseSync(projectId: bigint): void {
    const key = `${projectId}`;
    const state = this.syncStates.get(key);

    if (state) {
      state.isActive = false;
      console.log(`[Sync Manager] Sync paused for project ${projectId}`);
    }
  }

  /**
   * Resume sync
   */
  resumeSync(projectId: bigint): void {
    const key = `${projectId}`;
    const state = this.syncStates.get(key);

    if (state) {
      state.isActive = true;
      console.log(`[Sync Manager] Sync resumed for project ${projectId}`);
    }
  }

  /**
   * Sync VFS changes to Daytona
   */
  private async syncVFSToDaytona(state: SyncState): Promise<void> {
    // Get files modified since last sync
    const changedFilesIterator = db.query<{ path: string; updated_at: Date }>`
      SELECT path, updated_at
      FROM file_metadata
      WHERE project_id = ${state.projectId}
        AND updated_at > ${state.lastVFSSync}
        AND deleted_at IS NULL
        AND is_directory = false
      ORDER BY updated_at ASC
    `;

    let count = 0;
    for await (const row of changedFilesIterator) {
      count++;
      // Process row...
      try {
        const content = await gridfs.readFile(state.projectId, row.path);

        // Ensure parent directory exists (using process exec via daytonaManager if needed, or skip)
        // daytonaManager.executeCommand returns { exitCode, stdout, stderr }
        const parentDir = row.path.substring(0, row.path.lastIndexOf('/'));
        if (parentDir && parentDir !== '') {
          await daytonaManager.executeCommand(state.workspaceId, `mkdir -p "${parentDir}"`);
        }

        // Write file using daytonaManager
        const relativePath = row.path.startsWith('/') ? row.path.substring(1) : row.path;
        const stringContent = content.toString('utf-8');
        await daytonaManager.writeFile(state.workspaceId, relativePath, stringContent);

        console.log(`[Sync Manager] ✓ VFS→Daytona: ${row.path}`);
      } catch (error) {
        console.error(`[Sync Manager] ✗ Failed to sync ${row.path}:`, error);
      }
    }

    if (count > 0) {
      console.log(`[Sync Manager] VFS→Daytona: ${count} files changed`);
    }

    // Update last sync time
    state.lastVFSSync = new Date();
  }

  /**
   * Sync Daytona changes to VFS
   */
  private async syncDaytonaToVFS(state: SyncState): Promise<void> {
    try {
      const workspace = await daytonaManager.getWorkspace(state.workspaceId);
      if (!workspace.daytona_sandbox_id) {
        return;
      }

      // No need to get sandbox directly, we use daytonaManager wrappers now

      // Create marker file if it doesn't exist
      const markerPath = '/tmp/vaporform_sync_marker';
      try {
        await daytonaManager.readFile(workspace.id, markerPath);
      } catch {
        // Marker doesn't exist, create it
        await daytonaManager.writeFile(workspace.id, markerPath, state.lastDaytonaSync.toISOString());
      }

      // Get list of files modified since marker
      // Escape marker path to prevent command injection
      const escapedMarkerPath = escapeShellArg(markerPath);
      const result = await daytonaManager.executeCommand(
        workspace.id,
        `find . -type f -newer ${escapedMarkerPath} 2>/dev/null | grep -v node_modules | grep -v .git | grep -v .next | grep -v dist | grep -v build || echo ""`
      );

      if (!result.stdout || result.stdout.trim() === '') {
        return;
      }

      const changedFiles = result.stdout
        .split('\n')
        .filter(f => f.trim())
        .map(f => f.replace(/^\.\//, '/'))
        .map(f => f.startsWith('/') ? f : '/' + f);

      if (changedFiles.length === 0) {
        return;
      }

      console.log(`[Sync Manager] Daytona→VFS: ${changedFiles.length} files changed`);

      for (const filePath of changedFiles) {
        try {
          const relativePath = filePath.startsWith('/') ? filePath.substring(1) : filePath;
          const content = await daytonaManager.readFile(workspace.id, relativePath);

          // Determine mime type from extension
          const ext = filePath.split('.').pop() || '';
          const mimeType = this.getMimeType(ext);

          await gridfs.writeFile(state.projectId, filePath, content, mimeType);
          console.log(`[Sync Manager] ✓ Daytona→VFS: ${filePath}`);
        } catch (error) {
          console.error(`[Sync Manager] ✗ Failed to sync ${filePath}:`, error);
        }
      }

      // Update marker file
      await daytonaManager.writeFile(workspace.id, markerPath, new Date().toISOString());
      state.lastDaytonaSync = new Date();
    } catch (error) {
      console.error('[Sync Manager] Daytona→VFS sync failed:', error);
    }
  }

  /**
   * Full sync in one direction
   */
  async fullSync(
    projectId: bigint,
    workspaceId: bigint,
    direction: 'to-daytona' | 'to-vfs' | 'bidirectional'
  ): Promise<void> {
    console.log(`[Sync Manager] Starting full sync: ${direction}`);

    if (direction === 'to-daytona' || direction === 'bidirectional') {
      await this.fullSyncToDaytona(projectId, workspaceId);
    }

    if (direction === 'to-vfs' || direction === 'bidirectional') {
      await this.fullSyncToVFS(projectId, workspaceId);
    }

    console.log(`[Sync Manager] Full sync complete`);
  }

  /**
   * Full sync from VFS to Daytona
   */
  private async fullSyncToDaytona(projectId: bigint, workspaceId: bigint): Promise<void> {
    console.log(`[Sync Manager] Full VFS→Daytona sync starting...`);

    const workspace = await daytonaManager.getWorkspace(workspaceId);
    if (!workspace.daytona_sandbox_id) {
      console.warn(`[Sync Manager] No Daytona sandbox for workspace ${workspaceId}`);
      return;
    }



    // Get all files from VFS
    const files = await this.getAllVFSFiles(projectId, '/');
    const fileCount = files.length;

    console.log(`[Sync Manager] Syncing ${fileCount} files to Daytona...`);

    let synced = 0;
    for (const file of files) {
      if (!file.is_directory) {
        try {
          const content = await gridfs.readFile(projectId, file.path);
          const parentDir = file.path.substring(0, file.path.lastIndexOf('/'));

          if (parentDir && parentDir !== '') {
            await daytonaManager.executeCommand(workspace.id, `mkdir -p "${parentDir}"`);
          }

          const relativePath = file.path.startsWith('/') ? file.path.substring(1) : file.path;
          await daytonaManager.writeFile(workspace.id, relativePath, content.toString('utf-8'));

          synced++;
          if (synced % 10 === 0) {
            console.log(`[Sync Manager] Progress: ${synced}/${fileCount} files synced`);
          }
        } catch (error) {
          console.error(`[Sync Manager] Failed to sync ${file.path}:`, error);
        }
      }
    }

    console.log(`[Sync Manager] ✓ Full VFS→Daytona sync complete (${synced}/${fileCount} files)`);
  }

  /**
   * Full sync from Daytona to VFS
   */
  private async fullSyncToVFS(projectId: bigint, workspaceId: bigint): Promise<void> {
    console.log(`[Sync Manager] Full Daytona→VFS sync starting...`);

    const workspace = await daytonaManager.getWorkspace(workspaceId);
    if (!workspace.daytona_sandbox_id) {
      return;
    }



    // Get list of all files in Daytona
    const result = await daytonaManager.executeCommand(
      workspace.id,
      'find . -type f | grep -v node_modules | grep -v .git | grep -v .next | grep -v dist | grep -v build'
    );

    const files = result.stdout
      .split('\n')
      .filter(f => f.trim())
      .map(f => f.replace(/^\.\//, '/'))
      .map(f => f.startsWith('/') ? f : '/' + f);

    console.log(`[Sync Manager] Syncing ${files.length} files to VFS...`);

    let synced = 0;
    for (const filePath of files) {
      try {
        const relativePath = filePath.startsWith('/') ? filePath.substring(1) : filePath;
        const content = await daytonaManager.readFile(workspace.id, relativePath);

        const ext = filePath.split('.').pop() || '';
        const mimeType = this.getMimeType(ext);

        await gridfs.writeFile(projectId, filePath, content, mimeType);

        synced++;
        if (synced % 10 === 0) {
          console.log(`[Sync Manager] Progress: ${synced}/${files.length} files synced`);
        }
      } catch (error) {
        console.error(`[Sync Manager] Failed to sync ${filePath}:`, error);
      }
    }

    console.log(`[Sync Manager] ✓ Full Daytona→VFS sync complete (${synced}/${files.length} files)`);
  }

  /**
   * Get all files from VFS recursively
   */
  private async getAllVFSFiles(projectId: bigint, dirPath: string): Promise<any[]> {
    const files: any[] = [];
    const items = await gridfs.listDirectory(projectId, dirPath);

    for (const item of items) {
      if (item.is_directory) {
        const subFiles = await this.getAllVFSFiles(projectId, item.path);
        files.push(...subFiles);
      } else {
        files.push(item);
      }
    }

    return files;
  }

  /**
   * Get MIME type from file extension
   */
  private getMimeType(ext: string): string {
    const mimeTypes: Record<string, string> = {
      // Text
      'txt': 'text/plain',
      'md': 'text/markdown',
      'json': 'application/json',
      'xml': 'application/xml',
      'yaml': 'text/yaml',
      'yml': 'text/yaml',

      // Code
      'js': 'text/javascript',
      'ts': 'text/typescript',
      'jsx': 'text/javascript',
      'tsx': 'text/typescript',
      'py': 'text/x-python',
      'java': 'text/x-java',
      'go': 'text/x-go',
      'rs': 'text/x-rust',
      'php': 'text/x-php',
      'rb': 'text/x-ruby',
      'c': 'text/x-c',
      'cpp': 'text/x-c++',
      'h': 'text/x-c',
      'hpp': 'text/x-c++',

      // Web
      'html': 'text/html',
      'css': 'text/css',
      'scss': 'text/x-scss',
      'sass': 'text/x-sass',
      'less': 'text/x-less',

      // Config
      'env': 'text/plain',
      'gitignore': 'text/plain',
      'dockerignore': 'text/plain',
      'sh': 'text/x-shellscript',
      'bash': 'text/x-shellscript',
    };

    return mimeTypes[ext.toLowerCase()] || 'application/octet-stream';
  }

  /**
   * Get sync status for a project
   */
  getSyncStatus(projectId: bigint): {
    isActive: boolean;
    lastVFSSync?: Date;
    lastDaytonaSync?: Date;
  } | null {
    const key = `${projectId}`;
    const state = this.syncStates.get(key);

    if (!state) {
      return null;
    }

    return {
      isActive: state.isActive,
      lastVFSSync: state.lastVFSSync,
      lastDaytonaSync: state.lastDaytonaSync
    };
  }

  /**
   * Cleanup all active syncs (for graceful shutdown)
   */
  cleanup(): void {
    console.log(`[Sync Manager] Cleaning up ${this.syncStates.size} active syncs...`);
    for (const [key, state] of this.syncStates.entries()) {
      state.isActive = false;
      if (state.vfsInterval) clearInterval(state.vfsInterval);
      if (state.daytonaInterval) clearInterval(state.daytonaInterval);
    }
    this.syncStates.clear();
    console.log('[Sync Manager] Cleanup complete');
  }
}

export const syncManager = new SyncManager();
