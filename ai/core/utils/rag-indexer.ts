import { qdrantManager } from '../../../vector/qdrant-manager.js';

export async function indexFileForRAG(
    projectId: bigint,
    path: string,
    content: string,
    jobId: bigint
) {
    try {
        // Only index code files
        const ext = path.split('.').pop()?.toLowerCase();
        const indexableExts = ['ts', 'js', 'tsx', 'jsx', 'py', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'hpp', 'md', 'json', 'yaml', 'yml', 'css', 'html'];

        if (!ext || !indexableExts.includes(ext)) {
            return;
        }

        // Don't index massive files > 100KB
        if (content.length > 100 * 1024) {
            console.log(`[RAG] Skipping large file: ${path} (${content.length} bytes)`);
            return;
        }

        await qdrantManager.upsertEmbedding(
            projectId,
            'code',
            content,
            {
                path,
                jobId: jobId.toString(),
                ext
            }
        );
        console.log(`[RAG] Indexed file: ${path}`);
    } catch (err) {
        console.error(`[RAG] Failed to index file ${path}:`, err);
        // Don't fail the tool execution if indexing fails
    }
}
