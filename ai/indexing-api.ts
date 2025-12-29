/**
 * AI Indexing API
 * Batch indexing endpoints for RAG (Retrieval Augmented Generation)
 */

import { api, APIError } from 'encore.dev/api';
import { verifyClerkJWT } from '../shared/clerk-auth.js';
import { ensureProjectPermission } from '../projects/permissions.js';
import { gridfs } from '../vfs/gridfs.js';
import type { FileMetadata } from '../shared/types.js';

/**
 * Request to batch index a project
 */
export interface BatchIndexRequest {
  authorization: string;
  projectId: bigint;
}

/**
 * Response from batch indexing
 */
export interface BatchIndexResponse {
  success: boolean;
  projectId: bigint;
  filesIndexed: number;
  filesSkipped: number;
  chunksCreated: number;
  errors: string[];
  duration: number;
}

/**
 * Batch index all files in a project for RAG search
 *
 * This endpoint:
 * 1. Lists all files in the project VFS
 * 2. Filters for code files (skips binaries, node_modules, etc)
 * 3. Reads each file and chunks it (500 lines per chunk)
 * 4. Generates OpenAI embeddings for each chunk
 * 5. Stores embeddings in Qdrant vector database
 */
export const batchIndexProject = api(
  { method: 'POST', path: '/ai/index/batch', expose: true },
  async (req: BatchIndexRequest): Promise<BatchIndexResponse> => {
    const startTime = Date.now();

    // Verify authentication
    const { userId } = await verifyClerkJWT(req.authorization);

    // Verify user has access to project
    await ensureProjectPermission(userId, req.projectId, 'view');

    console.log(`[Batch Indexer] Starting batch index for project ${req.projectId} by user ${userId}`);

    let filesIndexed = 0;
    let filesSkipped = 0;
    let chunksCreated = 0;
    const errors: string[] = [];

    try {
      // Get all files from VFS (recursive scan)
      const allFiles = await getAllProjectFiles(req.projectId);
      console.log(`[Batch Indexer] Found ${allFiles.length} total files in project`);

      // Filter for code files only
      const codeFiles = allFiles.filter(file =>
        !file.is_directory && shouldIndexFile(file.path)
      );
      console.log(`[Batch Indexer] Filtered to ${codeFiles.length} code files to index`);

      // Process each file
      for (const file of codeFiles) {
        try {
          // Index the file using streaming
          const chunks = await indexFileForRAG(req.projectId, file.path);

          if (chunks === 0) {
            filesSkipped++;
            console.log(`[Batch Indexer] Skipped ${file.path} (empty or too small)`);
            continue;
          }

          filesIndexed++;
          chunksCreated += chunks;
          console.log(`[Batch Indexer] ✓ Indexed ${file.path} (${chunks} chunks)`);

        } catch (error) {
          const errorMsg = `Failed to index ${file.path}: ${error instanceof Error ? error.message : String(error)}`;
          errors.push(errorMsg);
          console.error(`[Batch Indexer] ${errorMsg}`);
          filesSkipped++;
        }
      }

      const duration = Date.now() - startTime;

      console.log(`[Batch Indexer] ✓ Batch indexing complete:
  - Files indexed: ${filesIndexed}
  - Files skipped: ${filesSkipped}
  - Chunks created: ${chunksCreated}
  - Duration: ${duration}ms
  - Errors: ${errors.length}`);

      return {
        success: errors.length === 0 || filesIndexed > 0,
        projectId: req.projectId,
        filesIndexed,
        filesSkipped,
        chunksCreated,
        errors,
        duration
      };

    } catch (error) {
      console.error('[Batch Indexer] Fatal error during batch indexing:', error);
      throw APIError.internal(
        `Batch indexing failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
);

/**
 * Get indexing status for a project
 */
export interface IndexStatusRequest {
  authorization: string;
  projectId: bigint;
}

export interface IndexStatusResponse {
  projectId: bigint;
  totalFiles: number;
  codeFiles: number;
  indexedChunks: number;
  lastIndexed: string | null;
}

/**
 * Get the current indexing status for a project
 */
export const getIndexStatus = api(
  { method: 'GET', path: '/ai/index/status/:projectId', expose: true },
  async (req: IndexStatusRequest): Promise<IndexStatusResponse> => {
    // Verify authentication
    const { userId } = await verifyClerkJWT(req.authorization);

    // Verify user has access to project
    await ensureProjectPermission(userId, req.projectId, 'view');

    // Get file counts
    const allFiles = await getAllProjectFiles(req.projectId);
    const codeFiles = allFiles.filter(file =>
      !file.is_directory && shouldIndexFile(file.path)
    );

    // Get indexed chunk count from Qdrant
    const { qdrantManager } = await import('../vector/qdrant-manager.js');
    let indexedChunks = 0;
    let lastIndexed: string | null = null;

    try {
      // Query Qdrant for collection info
      const collectionName = `project_${req.projectId}_code`;
      const info = await qdrantManager['client'].getCollection(collectionName);
      indexedChunks = info.points_count || 0;

      // Try to get timestamp from most recent point metadata
      if (indexedChunks > 0) {
        const searchResults = await qdrantManager.search(
          req.projectId,
          'code',
          'most recent',
          1,
          0.0
        );
        if (searchResults.length > 0 && searchResults[0].metadata.timestamp) {
          lastIndexed = searchResults[0].metadata.timestamp;
        }
      }
    } catch (error) {
      console.warn('[Index Status] Could not get Qdrant collection info:', error);
    }

    return {
      projectId: req.projectId,
      totalFiles: allFiles.length,
      codeFiles: codeFiles.length,
      indexedChunks,
      lastIndexed
    };
  }
);

/**
 * Clear all indexed data for a project
 */
export interface ClearIndexRequest {
  authorization: string;
  projectId: bigint;
}

export interface ClearIndexResponse {
  success: boolean;
  projectId: bigint;
  deletedChunks: number;
}

/**
 * Clear all RAG index data for a project
 */
export const clearProjectIndex = api(
  { method: 'DELETE', path: '/ai/index/clear/:projectId', expose: true },
  async (req: ClearIndexRequest): Promise<ClearIndexResponse> => {
    // Verify authentication
    const { userId } = await verifyClerkJWT(req.authorization);

    // Verify user has delete permission
    await ensureProjectPermission(userId, req.projectId, 'delete');

    console.log(`[Index Clear] Clearing index for project ${req.projectId}`);

    const { qdrantManager } = await import('../vector/qdrant-manager.js');

    try {
      // Get count before deletion
      const collectionName = `project_${req.projectId}_code`;
      let deletedChunks = 0;

      try {
        const info = await qdrantManager['client'].getCollection(collectionName);
        deletedChunks = info.points_count || 0;
      } catch (error) {
        // Collection might not exist
        console.log('[Index Clear] Collection does not exist, nothing to clear');
      }

      // Delete the entire collection
      await qdrantManager['client'].deleteCollection(collectionName);

      console.log(`[Index Clear] ✓ Deleted ${deletedChunks} chunks from project ${req.projectId}`);

      return {
        success: true,
        projectId: req.projectId,
        deletedChunks
      };

    } catch (error) {
      console.error('[Index Clear] Error clearing index:', error);
      throw APIError.internal(
        `Failed to clear index: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
);

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Recursively get all files from a project
 */
async function getAllProjectFiles(projectId: bigint): Promise<FileMetadata[]> {
  const allFiles: FileMetadata[] = [];
  const queue: string[] = ['/'];

  while (queue.length > 0) {
    const dirPath = queue.shift()!;
    const files = await gridfs.listDirectory(projectId, dirPath);

    for (const file of files) {
      allFiles.push(file);

      if (file.is_directory) {
        queue.push(file.path);
      }
    }
  }

  return allFiles;
}

/**
 * Check if a file should be indexed based on its path
 */
function shouldIndexFile(path: string): boolean {
  const codeExtensions = [
    '.ts', '.tsx', '.js', '.jsx',
    '.py', '.go', '.java', '.rb',
    '.css', '.scss', '.html', '.vue',
    '.c', '.cpp', '.h', '.hpp',
    '.rs', '.swift', '.kt', '.php',
    '.sql', '.graphql', '.proto',
    '.yaml', '.yml', '.json', '.xml',
    '.md', '.mdx', '.txt'
  ];

  const skipPatterns = [
    'node_modules/',
    '.git/',
    'dist/',
    'build/',
    '.next/',
    'out/',
    'coverage/',
    '.cache/',
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml',
    '.DS_Store',
    'thumbs.db'
  ];

  // Skip files matching skip patterns
  if (skipPatterns.some(pattern => path.includes(pattern))) {
    return false;
  }

  // Include files with code extensions
  return codeExtensions.some(ext => path.endsWith(ext));
}

/**
 * Detect programming language from file path
 */
function detectLanguage(path: string): string {
  const ext = path.substring(path.lastIndexOf('.'));
  const langMap: Record<string, string> = {
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.py': 'python',
    '.go': 'go',
    '.java': 'java',
    '.rb': 'ruby',
    '.css': 'css',
    '.scss': 'scss',
    '.html': 'html',
    '.vue': 'vue',
    '.c': 'c',
    '.cpp': 'cpp',
    '.h': 'c',
    '.hpp': 'cpp',
    '.rs': 'rust',
    '.swift': 'swift',
    '.kt': 'kotlin',
    '.php': 'php',
    '.sql': 'sql',
    '.graphql': 'graphql',
    '.proto': 'protobuf',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.json': 'json',
    '.xml': 'xml',
    '.md': 'markdown',
    '.mdx': 'markdown'
  };

  return langMap[ext] || 'plaintext';
}

/**
 * Index a single file for RAG search using streams
 * Returns the number of chunks created
 */
async function indexFileForRAG(
  projectId: bigint,
  path: string
): Promise<number> {
  const { qdrantManager } = await import('../vector/qdrant-manager.js');
  const { createInterface } = await import('readline');

  const fileStream = await gridfs.readFileStream(projectId, path);

  const rl = createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let currentChunkLines: string[] = [];
  let chunkIndex = 0;

  // We need to accumulate chunks and send them in batches to avoid 
  // keeping too many pending promises or Qdrant requests
  const BATCH_SIZE = 10; // Send to Qdrant every 10 chunks (5000 lines)
  let pendingItems: any[] = [];

  for await (const line of rl) {
    currentChunkLines.push(line);

    if (currentChunkLines.length >= 500) {
      // Finalize chunk
      const content = currentChunkLines.join('\n');

      pendingItems.push({
        content,
        metadata: {
          sourcePath: path,
          sourceId: `${path}:chunk${chunkIndex}`,
          language: detectLanguage(path),
          timestamp: new Date().toISOString(),
          chunkIndex: chunkIndex
        }
      });

      chunkIndex++;
      currentChunkLines = [];

      // Flush if batch is full
      if (pendingItems.length >= BATCH_SIZE) {
        await qdrantManager.batchUpsert(projectId, 'code', pendingItems);
        pendingItems = [];
      }
    }
  }

  // Process remaining lines
  if (currentChunkLines.length > 0) {
    const content = currentChunkLines.join('\n');
    if (content.trim().length > 0) { // Skip empty last chunks
      pendingItems.push({
        content,
        metadata: {
          sourcePath: path,
          sourceId: `${path}:chunk${chunkIndex}`,
          language: detectLanguage(path),
          timestamp: new Date().toISOString(),
          chunkIndex: chunkIndex
        }
      });
      chunkIndex++;
    }
  }

  // Flush remaining items
  if (pendingItems.length > 0) {
    await qdrantManager.batchUpsert(projectId, 'code', pendingItems);
  }

  return chunkIndex;
}
