/**
 * Qdrant Vector Store Manager
 * Manages vector embeddings for RAG (Retrieval Augmented Generation)
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import OpenAI from 'openai';
import { secret } from 'encore.dev/config';
import { SQLDatabase } from 'encore.dev/storage/sqldb';
import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';

// Define vector database secrets
const openAIAPIKey = secret("OpenAIAPIKey");
const qdrantURL = secret("QdrantURL");
const qdrantAPIKey = secret("QdrantAPIKey");

const db = new SQLDatabase('vector', {
  migrations: './migrations',
});

type ContentType = 'code' | 'chat' | 'documentation' | 'error';

interface EmbeddingMetadata {
  projectId: string;
  contentType: ContentType;
  sourcePath?: string;
  sourceId?: string;
  language?: string;
  framework?: string;
  timestamp?: string;
  [key: string]: any;
}

interface SearchResult {
  id: string;
  score: number;
  content: string;
  metadata: EmbeddingMetadata;
}

export class QdrantManager {
  private client!: QdrantClient;
  private openai!: OpenAI;
  private readonly embeddingModel = 'text-embedding-3-small';
  private readonly embeddingDimension = 1536;

  private initialized = false;

  constructor() {
    // Lazy initialization - clients will be initialized on first use
  }

  /**
   * Initialize Qdrant and OpenAI clients (called lazily on first use)
   */
  private initialize() {
    if (this.initialized) {
      return;
    }

    try {
      const url = qdrantURL();
      const apiKey = qdrantAPIKey();

      this.client = new QdrantClient({
        url,
        ...(apiKey && { apiKey }),
      });

      console.log(`✓ Qdrant client initialized (URL: ${url})`);
    } catch (error) {
      console.error('[Vector Service] Failed to initialize Qdrant client:', error);
      throw error;
    }

    // Initialize OpenAI for embeddings
    try {
      const apiKey = openAIAPIKey();

      if (!apiKey || !apiKey.startsWith('sk-')) {
        console.warn('[Vector Service] OpenAI API key not configured - embeddings will not work');
        this.openai = {} as OpenAI;
      } else {
        this.openai = new OpenAI({ apiKey });
        console.log('✓ OpenAI client initialized for embeddings');
      }
    } catch (error) {
      console.warn('[Vector Service] OpenAI secret not configured - embeddings disabled');
      this.openai = {} as OpenAI;
    }

    this.initialized = true;
  }

  /**
   * Get collection name for a project and content type
   */
  private getCollectionName(projectId: bigint, contentType: ContentType): string {
    return `project_${projectId}_${contentType}`;
  }

  /**
   * Initialize collections for a project
   */
  async initializeProject(projectId: bigint): Promise<void> {
    this.initialize();
    const contentTypes: ContentType[] = ['code', 'chat', 'documentation', 'error'];

    for (const contentType of contentTypes) {
      const collectionName = this.getCollectionName(projectId, contentType);

      // Check if collection exists
      const collections = await this.client.getCollections();
      const exists = collections.collections.some(c => c.name === collectionName);

      if (!exists) {
        // Create collection
        await this.client.createCollection(collectionName, {
          vectors: {
            size: this.embeddingDimension,
            distance: 'Cosine',
          },
          optimizers_config: {
            default_segment_number: 2,
          },
          replication_factor: 1,
        });

        console.log(`✓ Created Qdrant collection: ${collectionName}`);
      }
    }
  }

  /**
   * Generate embedding for text
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    const response = await this.openai.embeddings.create({
      model: this.embeddingModel,
      input: text,
    });

    return response.data[0].embedding;
  }

  /**
   * Calculate content hash for deduplication
   */
  private calculateHash(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * Add or update an embedding
   */
  async upsertEmbedding(
    projectId: bigint,
    contentType: ContentType,
    content: string,
    metadata: Partial<EmbeddingMetadata> = {}
  ): Promise<string> {
    this.initialize();
    const collectionName = this.getCollectionName(projectId, contentType);
    const contentHash = this.calculateHash(content);

    // Check if embedding already exists for this content
    const existing = await db.queryRow<{ qdrant_id: string }>`
      SELECT qdrant_id FROM embeddings
      WHERE project_id = ${projectId}
      AND content_type = ${contentType}
      AND content_hash = ${contentHash}
    `;

    let pointId: string;

    if (existing) {
      // Update existing embedding
      pointId = existing.qdrant_id;
      console.log(`✓ Updating existing embedding: ${pointId}`);
    } else {
      // Create new embedding
      pointId = uuidv4();
    }

    // Generate embedding vector
    const vector = await this.generateEmbedding(content);

    // Prepare full metadata
    const fullMetadata: EmbeddingMetadata = {
      projectId: projectId.toString(),
      contentType,
      timestamp: new Date().toISOString(),
      ...metadata,
    };

    // Upsert to Qdrant
    await this.client.upsert(collectionName, {
      wait: true,
      points: [
        {
          id: pointId,
          vector,
          payload: {
            content,
            ...fullMetadata,
          },
        },
      ],
    });

    // Store metadata in PostgreSQL
    if (existing) {
      await db.exec`
        UPDATE embeddings
        SET
          metadata = ${JSON.stringify(metadata)},
          updated_at = NOW()
        WHERE qdrant_id = ${pointId}
      `;
    } else {
      await db.exec`
        INSERT INTO embeddings (
          project_id,
          qdrant_id,
          collection_name,
          content_type,
          content_hash,
          source_path,
          source_id,
          metadata
        ) VALUES (
          ${projectId},
          ${pointId},
          ${collectionName},
          ${contentType},
          ${contentHash},
          ${metadata.sourcePath || null},
          ${metadata.sourceId || null},
          ${JSON.stringify(metadata)}
        )
      `;
    }

    console.log(`✓ Upserted embedding ${pointId} for project ${projectId} (${contentType})`);

    return pointId;
  }

  /**
   * Search for similar content
   */
  async search(
    projectId: bigint,
    contentType: ContentType,
    query: string,
    limit: number = 5,
    scoreThreshold: number = 0.7
  ): Promise<SearchResult[]> {
    this.initialize();
    const collectionName = this.getCollectionName(projectId, contentType);

    // Generate query embedding
    const queryVector = await this.generateEmbedding(query);

    // Search Qdrant
    const searchResults = await this.client.search(collectionName, {
      vector: queryVector,
      limit,
      score_threshold: scoreThreshold,
      with_payload: true,
    });

    // Format results
    const results: SearchResult[] = searchResults.map(result => ({
      id: result.id.toString(),
      score: result.score,
      content: (result.payload?.content as string) || '',
      metadata: result.payload as EmbeddingMetadata,
    }));

    return results;
  }

  /**
   * Delete embeddings by source
   */
  async deleteBySource(
    projectId: bigint,
    contentType: ContentType,
    sourcePath: string
  ): Promise<number> {
    this.initialize();
    const collectionName = this.getCollectionName(projectId, contentType);

    // Get point IDs from PostgreSQL
    const embeddings: Array<{ qdrant_id: string }> = [];
    for await (const emb of db.query<{ qdrant_id: string }>`
      SELECT qdrant_id FROM embeddings
      WHERE project_id = ${projectId}
      AND content_type = ${contentType}
      AND source_path = ${sourcePath}
    `) {
      embeddings.push(emb);
    }

    if (embeddings.length === 0) {
      return 0;
    }

    // Delete from Qdrant
    const pointIds = embeddings.map(e => e.qdrant_id);
    await this.client.delete(collectionName, {
      wait: true,
      points: pointIds,
    });

    // Delete from PostgreSQL
    await db.exec`
      DELETE FROM embeddings
      WHERE project_id = ${projectId}
      AND content_type = ${contentType}
      AND source_path = ${sourcePath}
    `;

    console.log(`✓ Deleted ${embeddings.length} embeddings for source: ${sourcePath}`);

    return embeddings.length;
  }

  /**
   * Delete all embeddings for a project
   */
  async deleteProject(projectId: bigint): Promise<void> {
    this.initialize();
    const contentTypes: ContentType[] = ['code', 'chat', 'documentation', 'error'];

    for (const contentType of contentTypes) {
      const collectionName = this.getCollectionName(projectId, contentType);

      try {
        // Delete collection from Qdrant
        await this.client.deleteCollection(collectionName);
        console.log(`✓ Deleted Qdrant collection: ${collectionName}`);
      } catch (error) {
        console.warn(`Warning: Could not delete collection ${collectionName}:`, error);
      }
    }

    // Delete metadata from PostgreSQL
    await db.exec`
      DELETE FROM embeddings
      WHERE project_id = ${projectId}
    `;

    console.log(`✓ Deleted all embeddings for project ${projectId}`);
  }

  /**
   * Batch upsert embeddings (for bulk operations)
   */
  async batchUpsert(
    projectId: bigint,
    contentType: ContentType,
    items: Array<{
      content: string;
      metadata?: Partial<EmbeddingMetadata>;
    }>
  ): Promise<string[]> {
    this.initialize();
    const collectionName = this.getCollectionName(projectId, contentType);
    const pointIds: string[] = [];

    // Process in batches of 100
    const batchSize = 100;
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);

      // Generate embeddings for batch
      const embeddings = await Promise.all(
        batch.map(item => this.generateEmbedding(item.content))
      );

      // Prepare points
      const points = batch.map((item, idx) => {
        const pointId = uuidv4();
        pointIds.push(pointId);

        const fullMetadata: EmbeddingMetadata = {
          projectId: projectId.toString(),
          contentType,
          timestamp: new Date().toISOString(),
          ...item.metadata,
        };

        return {
          id: pointId,
          vector: embeddings[idx],
          payload: {
            content: item.content,
            ...fullMetadata,
          },
        };
      });

      // Upsert batch to Qdrant
      await this.client.upsert(collectionName, {
        wait: true,
        points,
      });

      // Store metadata in PostgreSQL
      for (let j = 0; j < batch.length; j++) {
        const item = batch[j];
        const pointId = pointIds[i + j];
        const contentHash = this.calculateHash(item.content);

        await db.exec`
          INSERT INTO embeddings (
            project_id,
            qdrant_id,
            collection_name,
            content_type,
            content_hash,
            source_path,
            source_id,
            metadata
          ) VALUES (
            ${projectId},
            ${pointId},
            ${collectionName},
            ${contentType},
            ${contentHash},
            ${item.metadata?.sourcePath || null},
            ${item.metadata?.sourceId || null},
            ${JSON.stringify(item.metadata || {})}
          )
          ON CONFLICT (project_id, qdrant_id) DO UPDATE SET
            metadata = ${JSON.stringify(item.metadata || {})},
            updated_at = NOW()
        `;
      }

      console.log(`✓ Batch upserted ${batch.length} embeddings (${i + batch.length}/${items.length})`);
    }

    return pointIds;
  }

  /**
   * Get embedding statistics for a project
   */
  async getStats(projectId: bigint): Promise<Record<ContentType, number>> {
    const stats: Record<string, number> = {};

    const contentTypes: ContentType[] = ['code', 'chat', 'documentation', 'error'];

    for (const contentType of contentTypes) {
      const result = await db.queryRow<{ count: bigint }>`
        SELECT COUNT(*) as count FROM embeddings
        WHERE project_id = ${projectId}
        AND content_type = ${contentType}
      `;

      stats[contentType] = Number(result?.count || 0);
    }

    return stats as Record<ContentType, number>;
  }
}

// Singleton instance
export const qdrantManager = new QdrantManager();
