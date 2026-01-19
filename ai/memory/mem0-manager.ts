/**
 * Mem0 Manager
 * Manages persistent memory for agents using Mem0 SDK.
 */

import { MemoryClient } from 'mem0ai';
import { secret } from 'encore.dev/config';

// Define Mem0 secrets - configured via Encore secrets manager
const mem0APIKey = secret("Mem0APIKey");

export class Mem0Manager {
    private client: MemoryClient | null = null;
    private initialized = false;

    constructor() {
        this.initialize();
    }

    private initialize() {
        if (this.initialized) return;

        try {
            let apiKey = null;
            try {
                apiKey = mem0APIKey();
            } catch (e) {
                // Secret not found or error accessing it
            }

            // Fallback to environment variable (useful for local dev without generic secret linking)
            if (!apiKey && process.env.Mem0APIKey) {
                apiKey = process.env.Mem0APIKey;
            }

            if (apiKey) {
                this.client = new MemoryClient({ apiKey });
                console.log('✓ Mem0 client initialized');
                this.initialized = true;
            } else {
                console.warn('Mem0 API key not configured (checked secret Mem0APIKey and env var Mem0APIKey)');
            }
        } catch (e) {
            console.warn('Failed to initialize Mem0 manager:', e);
        }
    }

    /**
     * Add a memory for a user
     */
    async addMemory(userId: string, text: string, metadata?: Record<string, any>): Promise<any> {
        if (!this.client) return null;

        try {
            // Typically `add(messages, { user_id, ... })`
            const result = await this.client.add([
                {
                    role: "user",
                    content: text
                }
            ], {
                user_id: userId,
                metadata: metadata
            });
            console.log(`[Mem0] Added memory for user ${userId}`);
            return result;
        } catch (error) {
            console.error('[Mem0] Failed to add memory:', error);
            return null;
        }
    }

    /**
     * Search memories
     */
    async searchMemory(userId: string, query: string, limit: number = 5): Promise<string[]> {
        if (!this.client) return [];

        try {
            const results = await this.client.search(query, {
                user_id: userId,
                limit: limit
            });

            // format: results is usually list of objects with 'memory' or 'content'
            // Assuming return type is { id, memory: string, score: number }[]
            return results.map((r: any) => r.memory);
        } catch (error) {
            console.error('[Mem0] Failed to search memory:', error);
            return [];
        }
    }

    /**
     * Get all memories for a user
     */
    async getAllMemories(userId: string): Promise<any[]> {
        if (!this.client) return [];

        try {
            return await this.client.getAll({ user_id: userId });
        } catch (error) {
            console.error('[Mem0] Failed to get all memories:', error);
            return [];
        }
    }
}

export const mem0Manager = new Mem0Manager();
