
import { db } from '../projects/db.js';

/**
 * Truncate large objects for logging
 */
export function truncateForLog(obj: any, limit = 2048): any {
    if (!obj) return obj;
    if (typeof obj === 'string') {
        return obj.length > limit ? obj.substring(0, limit) + '...[TRUNCATED]' : obj;
    }
    if (Array.isArray(obj)) {
        return obj.map(item => truncateForLog(item, limit));
    }
    if (typeof obj === 'object') {
        const newObj: any = {};
        for (const key in obj) {
            newObj[key] = truncateForLog(obj[key], limit);
        }
        return newObj;
    }
    return obj;
}

/**
 * Log tool execution to generation_logs
 */
export async function logToolExecution(
    jobId: bigint,
    toolName: string,
    level: 'info' | 'warning' | 'error',
    message: string,
    metadata?: any
): Promise<void> {
    const safeMessage = truncateForLog(message);
    const safeMetadata = metadata ? truncateForLog(metadata) : null;

    // Skip database logging for interactive chat (jobId = 0)
    if (jobId === BigInt(0)) {
        // Just log to console instead
        if (level === 'error') {
            console.error(`[Tool Execution] ${toolName}: ${message}`, metadata);
        } else {
            console.log(`[Tool Execution] ${toolName}: ${message}`);
        }
        return;
    }

    await db.exec`
    INSERT INTO generation_logs (
      job_id,
      level,
      message,
      tool_name,
      metadata
    ) VALUES (
      ${jobId},
      ${level},
      ${safeMessage},
      ${toolName},
      ${safeMetadata}
    )
  `;
}

/**
 * Update job progress
 */
export async function updateJobProgress(jobId: bigint, step: string): Promise<void> {
    await db.exec`
    UPDATE generation_jobs
    SET current_step = ${step}
    WHERE id = ${jobId}
  `;
}

/**
 * Update deployment progress
 */
export async function updateDeploymentProgress(
    jobId: bigint,
    projectId: bigint,
    deploymentStatus: string,
    progress: number,
    message: string
): Promise<void> {
    try {
        await db.exec`
      UPDATE projects
      SET
        deployment_status = ${deploymentStatus},
        updated_at = NOW()
      WHERE id = ${projectId}
    `;

        await db.exec`
      UPDATE generation_jobs
      SET
        progress = ${progress},
        current_step = ${message},
        updated_at = NOW()
      WHERE id = ${jobId}
    `;

        console.log(`[Deployment Progress] ${progress}% - ${message} (status: ${deploymentStatus})`);
    } catch (error) {
        console.error(`[Deployment Progress] Failed to update progress:`, error);
    }
}

/**
 * Detect language from file extension
 */
export function detectLanguage(path: string): string {
    const ext = path.substring(path.lastIndexOf('.'));
    const languageMap: Record<string, string> = {
        '.ts': 'typescript', '.tsx': 'typescript',
        '.js': 'javascript', '.jsx': 'javascript',
        '.py': 'python', '.go': 'go', '.java': 'java', '.rb': 'ruby',
        '.css': 'css', '.scss': 'scss', '.html': 'html', '.vue': 'vue',
        '.c': 'c', '.cpp': 'cpp', '.h': 'c', '.hpp': 'cpp',
        '.rs': 'rust', '.swift': 'swift', '.kt': 'kotlin',
        '.php': 'php', '.sql': 'sql', '.graphql': 'graphql', '.proto': 'protobuf'
    };
    return languageMap[ext] || 'unknown';
}

/**
 * Split content into chunks
 */
export function splitIntoChunks(content: string, maxLines: number = 500): string[] {
    const lines = content.split('\n');
    if (lines.length <= maxLines) return [content];
    const chunks: string[] = [];
    for (let i = 0; i < lines.length; i += maxLines) {
        const chunk = lines.slice(i, i + maxLines).join('\n');
        chunks.push(chunk);
    }
    return chunks;
}

/**
 * Check if file should be indexed
 */
export function shouldIndexFile(path: string): boolean {
    const codeExtensions = [
        '.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.java', '.rb',
        '.css', '.scss', '.html', '.vue', '.c', '.cpp', '.h', '.hpp',
        '.rs', '.swift', '.kt', '.php', '.sql', '.graphql', '.proto'
    ];
    const skipPatterns = [
        'node_modules/', '.git/', 'dist/', 'build/', '.next/',
        'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'
    ];
    if (skipPatterns.some(pattern => path.includes(pattern))) return false;
    return codeExtensions.some(ext => path.endsWith(ext));
}

/**
 * Index file for RAG
 */
export async function indexFileForRAG(
    projectId: bigint,
    path: string,
    content: string,
    jobId: bigint
): Promise<void> {
    try {
        if (!shouldIndexFile(path)) return;
        if (content.trim().length < 50) return;

        const { qdrantManager } = await import('../vector/qdrant-manager.js');
        const chunks = splitIntoChunks(content, 500);

        const items = chunks.map((chunk, idx) => ({
            content: chunk,
            metadata: {
                sourcePath: path,
                sourceId: `${path}:chunk${idx}`,
                language: detectLanguage(path),
                timestamp: new Date().toISOString(),
                chunkIndex: idx,
                totalChunks: chunks.length
            }
        }));

        await qdrantManager.batchUpsert(projectId, 'code', items);
        console.log(`[RAG Indexer] ✓ Indexed ${chunks.length} chunk(s) from ${path}`);

        await logToolExecution(
            jobId,
            'auto_index',
            'info',
            `Indexed ${path} for RAG search (${chunks.length} chunks)`,
            { path, chunks: chunks.length, language: detectLanguage(path) }
        );
    } catch (error) {
        console.error(`[RAG Indexer] Failed to index ${path}:`, error);
    }
}

export function estimateProgress(toolExecutions: any[]): number {
    const writeFileCount = toolExecutions.filter(t => t.tool_name === 'write_to_file').length;
    const executeCommandCount = toolExecutions.filter(t => t.tool_name === 'execute_command').length;
    const readFileCount = toolExecutions.filter(t => t.tool_name === 'read_file').length;
    const listFilesCount = toolExecutions.filter(t => t.tool_name === 'list_files').length;
    const completionAttempt = toolExecutions.some(t => t.tool_name === 'attempt_completion');

    if (completionAttempt) return 100;

    let progress = 15;
    const fileProgress = Math.min(writeFileCount * 2, 50);
    progress += fileProgress;
    const commandProgress = Math.min(executeCommandCount * 5, 30);
    progress += commandProgress;
    const investigationProgress = Math.min((readFileCount + listFilesCount) * 0.5, 10);
    progress += investigationProgress;

    return Math.min(progress, 98);
}
