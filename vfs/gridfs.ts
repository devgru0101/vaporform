/**
 * GridFS Virtual File System
 * Provides file operations on MongoDB GridFS with complete tenant isolation
 */

import { MongoClient, GridFSBucket, ObjectId } from 'mongodb';
import { Readable } from 'stream';
import { secret } from 'encore.dev/config';
import { SQLDatabase } from 'encore.dev/storage/sqldb';
import type { FileMetadata } from '../shared/types.js';
import { ValidationError, NotFoundError } from '../shared/errors.js';
import { normalizePath, getParentPath, getFilename } from '../shared/utils.js';

// Define MongoDB connection secret
const mongoDBURI = secret("MongoDBURI");

export const db = new SQLDatabase('vfs', {
  migrations: './migrations',
});

export class GridFS {
  private client: MongoClient | null = null;
  private bucket: GridFSBucket | null = null;

  /**
   * Initialize MongoDB connection and GridFS bucket
   * 
   * DEVELOPMENT CONFIGURATION:
   * MongoDB/GridFS is made OPTIONAL for local development to allow the backend to start
   * without requiring a full MongoDB setup. This is useful for:
   * 
   * - Initial development and testing of non-file-related features
   * - Remote development environments where MongoDB may not be available
   * - CI/CD pipelines that don't require file storage
   * 
   * When MongoDBURI is not configured:
   * - The backend will start successfully with warnings
   * - File operations (upload, download, list) will fail gracefully
   * - All other features (projects, workspaces, AI agent) continue to work
   * 
   * For production or full-featured development, configure MongoDBURI in .secrets.local.cue
   * Example: MongoDBURI: "mongodb://localhost:27017/vaporform"
   */
  async connect(): Promise<void> {
    if (this.client) return;

    try {
      const uri = mongoDBURI();
      if (!uri) {
        console.warn('⚠️  MongoDB URI not configured - GridFS file storage disabled');
        console.warn('   File operations will fail until MongoDB is configured.');
        return; // Continue without MongoDB
      }

      this.client = new MongoClient(uri);
      await this.client.connect();

      const database = this.client.db('vaporform');
      this.bucket = new GridFSBucket(database, {
        bucketName: 'project_files',
        chunkSizeBytes: 255 * 1024, // 255KB chunks
      });

      console.log('✓ Connected to MongoDB GridFS');
    } catch (error) {
      console.warn('⚠️  Failed to connect to MongoDB GridFS:', error instanceof Error ? error.message : String(error));
      console.warn('   File operations will be disabled. Configure MongoDBURI secret to enable.');
    }
  }

  /**
   * Ensure connection is established
   */
  private ensureConnected(): GridFSBucket {
    if (!this.bucket) {
      throw new Error('GridFS not connected. Call connect() first.');
    }
    return this.bucket;
  }

  /**
   * Write a file to GridFS
   */
  async writeFile(
    projectId: bigint,
    path: string,
    content: Buffer | string,
    mimeType?: string
  ): Promise<FileMetadata> {
    const bucket = this.ensureConnected();
    const normalizedPath = normalizePath(path);
    const filename = getFilename(normalizedPath);
    const parentPath = getParentPath(normalizedPath);

    // Validate path
    if (!normalizedPath || normalizedPath === '/') {
      throw new ValidationError('Invalid file path');
    }

    // Check if file exists (for versioning)
    const existing = await db.queryRow<FileMetadata>`
      SELECT * FROM file_metadata
      WHERE project_id = ${projectId}
      AND path = ${normalizedPath}
      AND deleted_at IS NULL
    `;

    let version = 1;
    if (existing) {
      version = existing.version + 1;
      // Soft delete old version
      await db.exec`
        UPDATE file_metadata
        SET deleted_at = NOW()
        WHERE id = ${existing.id}
      `;
    }

    // Ensure parent directory exists
    if (parentPath && parentPath !== '/') {
      await this.ensureDirectory(projectId, parentPath);
    }

    // Upload to GridFS
    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf-8');
    const readableStream = Readable.from(buffer);

    const uploadStream = bucket.openUploadStream(filename, {
      metadata: {
        projectId: projectId.toString(),
        path: normalizedPath,
        version,
      },
    });

    await new Promise<void>((resolve, reject) => {
      readableStream.pipe(uploadStream)
        .on('finish', () => resolve())
        .on('error', reject);
    });

    const gridfsFileId = uploadStream.id.toString();

    // Store metadata in PostgreSQL
    const metadata = await db.queryRow<FileMetadata>`
      INSERT INTO file_metadata (
        project_id,
        gridfs_file_id,
        path,
        filename,
        mime_type,
        size_bytes,
        version,
        is_directory,
        parent_path
      ) VALUES (
        ${projectId},
        ${gridfsFileId},
        ${normalizedPath},
        ${filename},
        ${mimeType || 'application/octet-stream'},
        ${buffer.length},
        ${version},
        false,
        ${parentPath || null}
      )
      RETURNING *
    `;

    if (!metadata) {
      throw new Error('Failed to create file metadata');
    }

    console.log(`✓ Wrote file: ${normalizedPath} (Project: ${projectId}, Version: ${version})`);

    return metadata;
  }

  /**
   * Read a file from GridFS
   */
  async readFile(projectId: bigint, path: string): Promise<Buffer> {
    const bucket = this.ensureConnected();
    const normalizedPath = normalizePath(path);

    // Get metadata
    const metadata = await db.queryRow<FileMetadata>`
      SELECT * FROM file_metadata
      WHERE project_id = ${projectId}
      AND path = ${normalizedPath}
      AND deleted_at IS NULL
      AND is_directory = false
    `;

    if (!metadata) {
      throw new NotFoundError(`File not found: ${normalizedPath}`);
    }

    // Download from GridFS
    const downloadStream = bucket.openDownloadStream(new ObjectId(metadata.gridfs_file_id));

    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      downloadStream
        .on('data', (chunk) => chunks.push(chunk))
        .on('end', () => resolve())
        .on('error', reject);
    });

    return Buffer.concat(chunks);
  }

  /**
   * Read a file from GridFS as a stream
   */
  async readFileStream(projectId: bigint, path: string): Promise<Readable> {
    const bucket = this.ensureConnected();
    const normalizedPath = normalizePath(path);

    // Get metadata
    const metadata = await db.queryRow<FileMetadata>`
      SELECT * FROM file_metadata
      WHERE project_id = ${projectId}
      AND path = ${normalizedPath}
      AND deleted_at IS NULL
      AND is_directory = false
    `;

    if (!metadata) {
      throw new NotFoundError(`File not found: ${normalizedPath}`);
    }

    // Return download stream
    return bucket.openDownloadStream(new ObjectId(metadata.gridfs_file_id));
  }

  /**
   * Create a directory
   */
  async mkdir(projectId: bigint, path: string): Promise<FileMetadata> {
    const normalizedPath = normalizePath(path);

    if (!normalizedPath || normalizedPath === '/') {
      throw new ValidationError('Invalid directory path');
    }

    // Check if already exists
    const existing = await db.queryRow<FileMetadata>`
      SELECT * FROM file_metadata
      WHERE project_id = ${projectId}
      AND path = ${normalizedPath}
      AND deleted_at IS NULL
    `;

    if (existing) {
      if (existing.is_directory) {
        return existing; // Already exists
      } else {
        throw new ValidationError('Path exists as a file');
      }
    }

    const parentPath = getParentPath(normalizedPath);
    const filename = getFilename(normalizedPath);

    // Ensure parent directory exists
    if (parentPath && parentPath !== '/') {
      await this.ensureDirectory(projectId, parentPath);
    }

    // Create directory entry
    const metadata = await db.queryRow<FileMetadata>`
      INSERT INTO file_metadata (
        project_id,
        gridfs_file_id,
        path,
        filename,
        mime_type,
        size_bytes,
        version,
        is_directory,
        parent_path
      ) VALUES (
        ${projectId},
        '',
        ${normalizedPath},
        ${filename},
        'inode/directory',
        0,
        1,
        true,
        ${parentPath || null}
      )
      RETURNING *
    `;

    if (!metadata) {
      throw new Error('Failed to create directory');
    }

    console.log(`✓ Created directory: ${normalizedPath} (Project: ${projectId})`);

    return metadata;
  }

  /**
   * List directory contents
   */
  async listDirectory(projectId: bigint, path: string): Promise<FileMetadata[]> {
    const normalizedPath = normalizePath(path) || '/';

    const files: FileMetadata[] = [];
    for await (const file of db.query<FileMetadata>`
      SELECT * FROM file_metadata
      WHERE project_id = ${projectId}
      AND parent_path = ${normalizedPath}
      AND deleted_at IS NULL
      ORDER BY is_directory DESC, filename ASC
    `) {
      files.push(file);
    }

    return files;
  }

  /**
   * Delete a file or directory
   */
  async delete(projectId: bigint, path: string, recursive: boolean = false): Promise<void> {
    const normalizedPath = normalizePath(path);

    const metadata = await db.queryRow<FileMetadata>`
      SELECT * FROM file_metadata
      WHERE project_id = ${projectId}
      AND path = ${normalizedPath}
      AND deleted_at IS NULL
    `;

    if (!metadata) {
      throw new NotFoundError(`Path not found: ${normalizedPath}`);
    }

    if (metadata.is_directory) {
      // Check if directory has children
      const children = await db.queryRow<{ count: bigint }>`
        SELECT COUNT(*) as count FROM file_metadata
        WHERE project_id = ${projectId}
        AND parent_path = ${normalizedPath}
        AND deleted_at IS NULL
      `;

      const childCount = Number(children?.count || 0);

      if (childCount > 0 && !recursive) {
        throw new ValidationError('Directory not empty. Use recursive=true to delete.');
      }

      if (recursive) {
        // Recursively delete children
        const childFiles: FileMetadata[] = [];
        for await (const child of db.query<FileMetadata>`
          SELECT * FROM file_metadata
          WHERE project_id = ${projectId}
          AND parent_path = ${normalizedPath}
          AND deleted_at IS NULL
        `) {
          childFiles.push(child);
        }

        for (const child of childFiles) {
          await this.delete(projectId, child.path, true);
        }
      }
    } else {
      // Delete file from GridFS
      if (metadata.gridfs_file_id) {
        const bucket = this.ensureConnected();
        try {
          await bucket.delete(new ObjectId(metadata.gridfs_file_id));
        } catch (error) {
          console.warn(`Warning: Could not delete GridFS file ${metadata.gridfs_file_id}:`, error);
        }
      }
    }

    // Soft delete metadata
    await db.exec`
      UPDATE file_metadata
      SET deleted_at = NOW()
      WHERE id = ${metadata.id}
    `;

    console.log(`✓ Deleted: ${normalizedPath} (Project: ${projectId})`);
  }

  /**
   * Rename/move a file or directory
   */
  async rename(projectId: bigint, oldPath: string, newPath: string): Promise<FileMetadata> {
    const normalizedOldPath = normalizePath(oldPath);
    const normalizedNewPath = normalizePath(newPath);

    const metadata = await db.queryRow<FileMetadata>`
      SELECT * FROM file_metadata
      WHERE project_id = ${projectId}
      AND path = ${normalizedOldPath}
      AND deleted_at IS NULL
    `;

    if (!metadata) {
      throw new NotFoundError(`Path not found: ${normalizedOldPath}`);
    }

    // Check if new path already exists
    const existing = await db.queryRow<FileMetadata>`
      SELECT * FROM file_metadata
      WHERE project_id = ${projectId}
      AND path = ${normalizedNewPath}
      AND deleted_at IS NULL
    `;

    if (existing) {
      throw new ValidationError(`Path already exists: ${normalizedNewPath}`);
    }

    const newParentPath = getParentPath(normalizedNewPath);
    const newFilename = getFilename(normalizedNewPath);

    // Ensure new parent directory exists
    if (newParentPath && newParentPath !== '/') {
      await this.ensureDirectory(projectId, newParentPath);
    }

    // Update metadata
    await db.exec`
      UPDATE file_metadata
      SET
        path = ${normalizedNewPath},
        filename = ${newFilename},
        parent_path = ${newParentPath || null},
        updated_at = NOW()
      WHERE id = ${metadata.id}
    `;

    // If directory, update all children's parent_path
    if (metadata.is_directory) {
      await db.exec`
        UPDATE file_metadata
        SET
          parent_path = REPLACE(parent_path, ${normalizedOldPath}, ${normalizedNewPath}),
          path = REPLACE(path, ${normalizedOldPath}, ${normalizedNewPath}),
          updated_at = NOW()
        WHERE project_id = ${projectId}
        AND (parent_path LIKE ${normalizedOldPath + '/%'} OR path LIKE ${normalizedOldPath + '/%'})
        AND deleted_at IS NULL
      `;
    }

    const updated = await db.queryRow<FileMetadata>`
      SELECT * FROM file_metadata WHERE id = ${metadata.id}
    `;

    if (!updated) {
      throw new Error('Failed to rename file');
    }

    console.log(`✓ Renamed: ${normalizedOldPath} → ${normalizedNewPath} (Project: ${projectId})`);

    return updated;
  }

  /**
   * Get file or directory metadata
   */
  async getMetadata(projectId: bigint, path: string): Promise<FileMetadata | null> {
    const normalizedPath = normalizePath(path);

    const metadata = await db.queryRow<FileMetadata>`
      SELECT * FROM file_metadata
      WHERE project_id = ${projectId}
      AND path = ${normalizedPath}
      AND deleted_at IS NULL
    `;

    return metadata || null;
  }

  /**
   * Get project storage usage
   */
  async getStorageUsage(projectId: bigint): Promise<bigint> {
    const result = await db.queryRow<{ total: bigint }>`
      SELECT COALESCE(SUM(size_bytes), 0) as total
      FROM file_metadata
      WHERE project_id = ${projectId}
      AND is_directory = false
      AND deleted_at IS NULL
    `;

    return result?.total || BigInt(0);
  }

  /**
   * Ensure directory exists (creates if needed)
   */
  private async ensureDirectory(projectId: bigint, path: string): Promise<void> {
    const normalizedPath = normalizePath(path);
    if (!normalizedPath || normalizedPath === '/') return;

    const existing = await db.queryRow<FileMetadata>`
      SELECT * FROM file_metadata
      WHERE project_id = ${projectId}
      AND path = ${normalizedPath}
      AND deleted_at IS NULL
    `;

    if (!existing) {
      await this.mkdir(projectId, normalizedPath);
    } else if (!existing.is_directory) {
      throw new ValidationError(`Path exists as a file: ${normalizedPath}`);
    }
  }

  /**
   * Close MongoDB connection
   */
  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.bucket = null;
      console.log('✓ Disconnected from MongoDB GridFS');
    }
  }
}

// Singleton instance
export const gridfs = new GridFS();
