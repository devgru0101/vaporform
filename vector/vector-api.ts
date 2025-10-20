/**
 * Vector Store API endpoints
 * Provides embedding and search operations with RBAC enforcement
 */

import { api, Header } from 'encore.dev/api';
import { verifyClerkJWT } from '../shared/clerk-auth.js';
import { ensureProjectPermission } from '../projects/permissions.js';
import { qdrantManager } from './qdrant-manager.js';
import { ValidationError, toAPIError } from '../shared/errors.js';

type ContentType = 'code' | 'chat' | 'documentation' | 'error';

interface InitializeProjectRequest {
  authorization: Header<'Authorization'>;
  projectId: string;
}

interface UpsertEmbeddingRequest {
  authorization: Header<'Authorization'>;
  projectId: string;
  contentType: ContentType;
  content: string;
  metadata?: Record<string, any>;
}

interface UpsertEmbeddingResponse {
  pointId: string;
}

interface SearchRequest {
  authorization: Header<'Authorization'>;
  projectId: string;
  contentType: ContentType;
  query: string;
  limit?: number;
  scoreThreshold?: number;
}

interface SearchResponse {
  results: Array<{
    id: string;
    score: number;
    content: string;
    metadata: Record<string, any>;
  }>;
}

interface BatchUpsertRequest {
  authorization: Header<'Authorization'>;
  projectId: string;
  contentType: ContentType;
  items: Array<{
    content: string;
    metadata?: Record<string, any>;
  }>;
}

interface BatchUpsertResponse {
  pointIds: string[];
  count: number;
}

interface DeleteBySourceRequest {
  authorization: Header<'Authorization'>;
  projectId: string;
  contentType: string; // Encore doesn't support custom types in path params
  sourcePath: string;
}

interface GetStatsRequest {
  authorization: Header<'Authorization'>;
  projectId: string;
}

interface GetStatsResponse {
  stats: Record<ContentType, number>;
  total: number;
}

/**
 * Initialize vector collections for a project
 */
export const initializeProject = api(
  { method: 'POST', path: '/vector/init' },
  async (req: InitializeProjectRequest): Promise<{ success: boolean }> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const projectId = BigInt(req.projectId);

    await ensureProjectPermission(userId, projectId, 'edit');

    await qdrantManager.initializeProject(projectId);

    return { success: true };
  }
);

/**
 * Add or update an embedding
 */
export const upsertEmbedding = api(
  { method: 'POST', path: '/vector/embed' },
  async (req: UpsertEmbeddingRequest): Promise<UpsertEmbeddingResponse> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const projectId = BigInt(req.projectId);

    await ensureProjectPermission(userId, projectId, 'edit');

    if (!req.content || req.content.trim().length === 0) {
      throw toAPIError(new ValidationError('Content cannot be empty'));
    }

    const validContentTypes: ContentType[] = ['code', 'chat', 'documentation', 'error'];
    if (!validContentTypes.includes(req.contentType)) {
      throw toAPIError(new ValidationError(`Invalid content type. Must be one of: ${validContentTypes.join(', ')}`));
    }

    const pointId = await qdrantManager.upsertEmbedding(
      projectId,
      req.contentType,
      req.content,
      req.metadata
    );

    return { pointId };
  }
);

/**
 * Search for similar content
 */
export const search = api(
  { method: 'POST', path: '/vector/search' },
  async (req: SearchRequest): Promise<SearchResponse> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const projectId = BigInt(req.projectId);

    await ensureProjectPermission(userId, projectId, 'view');

    if (!req.query || req.query.trim().length === 0) {
      throw toAPIError(new ValidationError('Query cannot be empty'));
    }

    const limit = req.limit || 5;
    const scoreThreshold = req.scoreThreshold || 0.7;

    if (limit < 1 || limit > 50) {
      throw toAPIError(new ValidationError('Limit must be between 1 and 50'));
    }

    if (scoreThreshold < 0 || scoreThreshold > 1) {
      throw toAPIError(new ValidationError('Score threshold must be between 0 and 1'));
    }

    const results = await qdrantManager.search(
      projectId,
      req.contentType,
      req.query,
      limit,
      scoreThreshold
    );

    return { results };
  }
);

/**
 * Batch upsert embeddings
 */
export const batchUpsert = api(
  { method: 'POST', path: '/vector/batch-embed' },
  async (req: BatchUpsertRequest): Promise<BatchUpsertResponse> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const projectId = BigInt(req.projectId);

    await ensureProjectPermission(userId, projectId, 'edit');

    if (!req.items || req.items.length === 0) {
      throw toAPIError(new ValidationError('Items array cannot be empty'));
    }

    if (req.items.length > 1000) {
      throw toAPIError(new ValidationError('Cannot batch upsert more than 1000 items at once'));
    }

    const pointIds = await qdrantManager.batchUpsert(
      projectId,
      req.contentType,
      req.items
    );

    return {
      pointIds,
      count: pointIds.length,
    };
  }
);

/**
 * Delete embeddings by source path
 */
export const deleteBySource = api(
  { method: 'DELETE', path: '/vector/source/:projectId/:contentType' },
  async (req: DeleteBySourceRequest): Promise<{ deleted: number }> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const projectId = BigInt(req.projectId);

    await ensureProjectPermission(userId, projectId, 'edit');

    const deleted = await qdrantManager.deleteBySource(
      projectId,
      req.contentType as ContentType,
      req.sourcePath
    );

    return { deleted };
  }
);

/**
 * Get embedding statistics for a project
 */
export const getStats = api(
  { method: 'GET', path: '/vector/stats/:projectId' },
  async (req: GetStatsRequest): Promise<GetStatsResponse> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const projectId = BigInt(req.projectId);

    await ensureProjectPermission(userId, projectId, 'view');

    const stats = await qdrantManager.getStats(projectId);

    const total = Object.values(stats).reduce((sum, count) => sum + count, 0);

    return { stats, total };
  }
);

/**
 * Index all code files for a project
 */
export const indexProjectCode = api(
  { method: 'POST', path: '/vector/index-code/:projectId' },
  async ({
    authorization,
    projectId,
  }: {
    authorization: Header<'Authorization'>;
    projectId: string;
  }): Promise<{ success: boolean; filesIndexed: number; embeddingsCreated: number }> => {
    const { userId } = await verifyClerkJWT(authorization);
    const id = BigInt(projectId);

    await ensureProjectPermission(userId, id, 'edit');

    // This will be implemented to:
    // 1. Get all code files from VFS
    // 2. Split files into chunks if needed
    // 3. Batch upsert embeddings
    // For now, returning placeholder

    console.log(`✓ Code indexing requested for project ${projectId}`);

    return {
      success: true,
      filesIndexed: 0,
      embeddingsCreated: 0,
    };
  }
);
