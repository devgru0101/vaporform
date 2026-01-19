/**
 * Virtual File System API endpoints
 * Provides file operations with RBAC enforcement
 */

import { api, Header } from 'encore.dev/api';
import { verifyClerkJWT } from '../shared/clerk-auth.js';
import { ensureProjectPermission } from '../projects/permissions.js';
import { gridfs } from './gridfs.js';
import { daytonaManager } from '../workspace/daytona-manager.js'; // NEW: For reading from Daytona sandbox
import { ValidationError, toAPIError } from '../shared/errors.js';
import type { FileMetadata } from '../shared/types.js';
import { ALLOWED_FILE_EXTENSIONS, MAX_FILE_SIZE_BYTES } from '../shared/constants.js';
import { db as projectDB } from '../projects/db.js'; // NEW: For getting workspace ID
import { promises as fs } from 'fs'; // For reading Git repos
import { join, basename, dirname } from 'path'; // For path manipulation
import { tmpdir } from 'os'; // For Git repo location

// Initialize GridFS connection on service start
gridfs.connect().catch((err) => {
  console.error('Failed to connect to GridFS:', err);
  process.exit(1);
});

interface WriteFileRequest {
  authorization: Header<'Authorization'>;
  projectId: string;
  path: string;
  content: string; // Base64 encoded for binary files
  mimeType?: string;
  encoding?: 'utf-8' | 'base64';
}

interface ReadFileRequest {
  authorization: Header<'Authorization'>;
  projectId: string;
  path: string;
}

interface ReadFileResponse {
  content: string; // Base64 encoded
  metadata: FileMetadata;
}

interface ListDirectoryRequest {
  authorization: Header<'Authorization'>;
  projectId: string;
  path?: string;
}

interface ListDirectoryResponse {
  files: FileMetadata[];
}

interface DeleteRequest {
  authorization: Header<'Authorization'>;
  projectId: string;
  path: string;
  recursive?: boolean;
}

interface RenameRequest {
  authorization: Header<'Authorization'>;
  projectId: string;
  oldPath: string;
  newPath: string;
}

interface MkdirRequest {
  authorization: Header<'Authorization'>;
  projectId: string;
  path: string;
}

interface GetMetadataRequest {
  authorization: Header<'Authorization'>;
  projectId: string;
  path: string;
}

interface GetMetadataResponse {
  metadata: FileMetadata | null;
}

interface GetStorageUsageRequest {
  authorization: Header<'Authorization'>;
  projectId: string;
}

interface GetStorageUsageResponse {
  usedBytes: string; // BigInt as string for JSON serialization
  totalBytes: string;
  percentage: number;
}

/**
 * Write a file to the virtual file system
 */
export const writeFile = api(
  { method: 'POST', path: '/vfs/files' },
  async (req: WriteFileRequest): Promise<{ metadata: FileMetadata }> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const projectId = BigInt(req.projectId);

    // Check edit permission
    await ensureProjectPermission(userId, projectId, 'edit');

    // Validate file extension
    const ext = req.path.split('.').pop()?.toLowerCase();
    if (ext && !ALLOWED_FILE_EXTENSIONS.includes(ext)) {
      throw toAPIError(new ValidationError(`File extension .${ext} is not allowed`));
    }

    // Decode content
    const encoding = req.encoding || 'utf-8';
    const buffer = encoding === 'base64'
      ? Buffer.from(req.content, 'base64')
      : Buffer.from(req.content, 'utf-8');

    // Check file size
    if (buffer.length > MAX_FILE_SIZE_BYTES) {
      throw toAPIError(new ValidationError(
        `File size ${buffer.length} bytes exceeds maximum ${MAX_FILE_SIZE_BYTES} bytes`
      ));
    }

    const metadata = await gridfs.writeFile(
      projectId,
      req.path,
      buffer,
      req.mimeType
    );

    return { metadata };
  }
);

/**
 * Read a file from the virtual file system
 */
export const readFile = api(
  { method: 'GET', path: '/vfs/files/:projectId/*path' },
  async (req: ReadFileRequest): Promise<ReadFileResponse> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const projectId = BigInt(req.projectId);

    // Check view permission
    await ensureProjectPermission(userId, projectId, 'view');

    // Import validation utilities
    const { validateFilePath } = await import('../shared/validation.js');
    const { normalizePath } = await import('../shared/utils.js');
    const { resolve } = await import('path');

    // Validate and normalize path to prevent directory traversal
    let normalizedPath: string;
    try {
      normalizedPath = validateFilePath(req.path);
      normalizedPath = normalizePath(normalizedPath).replace(/^\/+/, '');
    } catch (error) {
      throw toAPIError(new ValidationError('Invalid file path'));
    }

    try {
      // Read from local Git repository (matching listDirectory behavior)
      const gitRepoPath = join(tmpdir(), `vaporform-git-${projectId}`);
      const fullPath = resolve(gitRepoPath, normalizedPath);

      // Security check: Ensure resolved path is within the git repo directory
      if (!fullPath.startsWith(gitRepoPath)) {
        throw toAPIError(new ValidationError('Path traversal detected'));
      }

      console.log(`[VFS] Reading file from Git repo: ${fullPath}`);

      // Read file content
      const buffer = await fs.readFile(fullPath);

      // Get file stats for metadata
      const stats = await fs.stat(fullPath);

      // Create metadata object matching FileMetadata interface
      const metadata = {
        id: BigInt(Date.now()),
        project_id: projectId,
        gridfs_file_id: '', // Not using GridFS anymore
        path: normalizedPath,
        filename: basename(normalizedPath),
        mime_type: 'text/plain', // Could enhance with mime-type detection
        size_bytes: BigInt(stats.size),
        version: 1,
        is_directory: false,
        parent_path: dirname(normalizedPath),
        created_at: stats.birthtime,
        updated_at: stats.mtime,
        deleted_at: null,
      };

      // Return as base64 to handle binary files
      return {
        content: buffer.toString('base64'),
        metadata,
      };
    } catch (error) {
      console.error(`[VFS] Error reading file from Git:`, error);
      throw toAPIError(new ValidationError(`File not found: ${normalizedPath}`));
    }
  }
);

/**
 * Create a directory
 */
export const createDirectory = api(
  { method: 'POST', path: '/vfs/directories' },
  async (req: MkdirRequest): Promise<{ metadata: FileMetadata }> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const projectId = BigInt(req.projectId);

    await ensureProjectPermission(userId, projectId, 'edit');

    const metadata = await gridfs.mkdir(projectId, req.path);

    return { metadata };
  }
);

/**
 * List directory contents
 */
export const listDirectory = api(
  { method: 'GET', path: '/vfs/directories/:projectId' },
  async (req: ListDirectoryRequest): Promise<ListDirectoryResponse> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const projectId = BigInt(req.projectId);

    await ensureProjectPermission(userId, projectId, 'view');

    // Import validation utilities
    const { validateFilePath } = await import('../shared/validation.js');
    const { normalizePath } = await import('../shared/utils.js');
    const { resolve } = await import('path');

    try {
      // Validate and normalize path to prevent directory traversal
      let requestedPath = req.path || '/';
      try {
        if (requestedPath !== '/') {
          requestedPath = validateFilePath(requestedPath);
          requestedPath = normalizePath(requestedPath);
        }
      } catch (error) {
        throw toAPIError(new ValidationError('Invalid directory path'));
      }

      // Read from local Git repository
      const gitRepoPath = join(tmpdir(), `vaporform-git-${projectId}`);
      const fullPath = resolve(gitRepoPath, requestedPath.replace(/^\/+/, ''));

      // Security check: Ensure resolved path is within the git repo directory
      if (!fullPath.startsWith(gitRepoPath)) {
        throw toAPIError(new ValidationError('Path traversal detected'));
      }

      console.log(`[VFS] Reading from Git repo: ${gitRepoPath}, path: ${requestedPath}`);

      // Read directory contents
      const entries = await fs.readdir(fullPath, { withFileTypes: true });

      // Convert to FileMetadata format
      const files: any[] = await Promise.all(
        entries
          .filter(entry => {
            // Exclude .git directory
            if (entry.name.startsWith('.git')) return false;

            // Exclude temp files created by agent
            if (entry.name.endsWith('.log')) return false;
            if (entry.name.startsWith('proxy-server')) return false;
            if (entry.name === 'nohup.out') return false;

            // Exclude common temp directories
            if (entry.name === 'tmp' || entry.name === '.tmp') return false;
            if (entry.name === '.daytona') return false;

            // Exclude OS/system files
            if (entry.name.startsWith('.DS_Store')) return false;
            if (entry.name === 'Thumbs.db') return false;

            return true;
          })
          .map(async (entry) => {
            const entryPath = join(fullPath, entry.name);
            const relativePath = join(requestedPath, entry.name).replace(/^\/+/, ''); // Remove leading slashes

            try {
              const stats = await fs.stat(entryPath);
              const isDirectory = entry.isDirectory();

              return {
                id: BigInt(Date.now() + Math.floor(Math.random() * 1000)), // Temp ID for display
                filename: entry.name, // FIXED: was "name", frontend expects "filename"
                path: relativePath || entry.name, // Ensure path is never empty
                is_directory: isDirectory, // FIXED: was "type: 'directory'/'file'", frontend expects boolean
                mime_type: isDirectory ? 'inode/directory' : 'text/plain',
                size_bytes: entry.isFile() ? BigInt(stats.size) : BigInt(0),
                created_at: stats.birthtime,
                updated_at: stats.mtime,
              };
            } catch (error) {
              console.warn(`[VFS] Failed to stat ${entryPath}:`, error);
              return null;
            }
          })
      );

      const validFiles = files.filter(f => f !== null);
      console.log(`[VFS] Found ${validFiles.length} files in Git repo`);

      return { files: validFiles };
    } catch (error) {
      console.error(`[VFS] Error reading Git repo:`, error);

      // If Git repo doesn't exist, return empty (don't fail)
      if ((error as any).code === 'ENOENT') {
        console.log(`[VFS] Git repo not found for project ${projectId}, returning empty`);
        return { files: [] };
      }

      throw toAPIError(new ValidationError(`Failed to list directory: ${error instanceof Error ? error.message : 'Unknown error'}`));
    }
  }
);

/**
 * Delete a file or directory
 */
export const deleteFile = api(
  { method: 'DELETE', path: '/vfs/files/:projectId/*path' },
  async (req: DeleteRequest): Promise<{ success: boolean }> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const projectId = BigInt(req.projectId);

    await ensureProjectPermission(userId, projectId, 'edit');

    await gridfs.delete(projectId, req.path, req.recursive || false);

    return { success: true };
  }
);

/**
 * Rename/move a file or directory
 */
export const renameFile = api(
  { method: 'PUT', path: '/vfs/files/:projectId/rename' },
  async (req: RenameRequest): Promise<{ metadata: FileMetadata }> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const projectId = BigInt(req.projectId);

    await ensureProjectPermission(userId, projectId, 'edit');

    const metadata = await gridfs.rename(projectId, req.oldPath, req.newPath);

    return { metadata };
  }
);

/**
 * Get file or directory metadata
 */
export const getFileMetadata = api(
  { method: 'GET', path: '/vfs/metadata/:projectId/*path' },
  async (req: GetMetadataRequest): Promise<GetMetadataResponse> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const projectId = BigInt(req.projectId);

    await ensureProjectPermission(userId, projectId, 'view');

    const metadata = await gridfs.getMetadata(projectId, req.path);

    return { metadata };
  }
);

/**
 * Get project storage usage
 */
export const getStorageUsage = api(
  { method: 'GET', path: '/vfs/storage/:projectId' },
  async (req: GetStorageUsageRequest): Promise<GetStorageUsageResponse> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const projectId = BigInt(req.projectId);

    await ensureProjectPermission(userId, projectId, 'view');

    const usedBytes = await gridfs.getStorageUsage(projectId);

    // Get project subscription tier to determine total available
    // For now, using a placeholder - this will be enhanced with actual subscription limits
    const totalBytes = BigInt(10 * 1024 * 1024 * 1024); // 10GB default

    const percentage = Number((usedBytes * BigInt(100)) / totalBytes);

    return {
      usedBytes: usedBytes.toString(),
      totalBytes: totalBytes.toString(),
      percentage,
    };
  }
);

/**
 * Initialize project file system with template structure
 */
export const initializeProject = api(
  { method: 'POST', path: '/vfs/initialize/:projectId' },
  async ({
    authorization,
    projectId,
    template
  }: {
    authorization: Header<'Authorization'>;
    projectId: string;
    template?: string;
  }): Promise<{ success: boolean; filesCreated: number }> => {
    const { userId } = await verifyClerkJWT(authorization);
    const id = BigInt(projectId);

    await ensureProjectPermission(userId, id, 'edit');

    // Create basic directory structure
    const directories = ['/src', '/public'];

    for (const dir of directories) {
      await gridfs.mkdir(id, dir);
    }

    // Create initial files based on template
    let filesCreated = directories.length;

    if (template === 'react-vite') {
      await gridfs.writeFile(id, '/src/main.tsx', `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
`, 'text/typescript');

      await gridfs.writeFile(id, '/src/App.tsx', `import React from 'react'

function App() {
  return (
    <div className="App">
      <h1>Welcome to Vaporform</h1>
      <p>Start building your application</p>
    </div>
  )
}

export default App
`, 'text/typescript');

      await gridfs.writeFile(id, '/src/index.css', `body {
  margin: 0;
  font-family: system-ui, -apple-system, sans-serif;
  background: #000;
  color: #fff;
}

.App {
  padding: 2rem;
}
`, 'text/css');

      await gridfs.writeFile(id, '/index.html', `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vaporform Project</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`, 'text/html');

      filesCreated += 4;
    } else if (template === 'nextjs') {
      await gridfs.writeFile(id, '/src/app/page.tsx', `export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <h1 className="text-4xl font-bold">Welcome to Vaporform</h1>
      <p className="mt-4">Start building your Next.js application</p>
    </main>
  )
}
`, 'text/typescript');

      await gridfs.writeFile(id, '/src/app/layout.tsx', `import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Vaporform Project',
  description: 'Built with Vaporform',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
`, 'text/typescript');

      filesCreated += 2;
    } else {
      // Default empty project
      await gridfs.writeFile(id, '/README.md', `# Vaporform Project

Start building your application!
`, 'text/markdown');

      filesCreated += 1;
    }

    console.log(`✓ Initialized project ${projectId} with ${filesCreated} files (Template: ${template || 'none'})`);

    return { success: true, filesCreated };
  }
);
