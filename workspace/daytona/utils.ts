
/**
 * Retry an operation with exponential backoff
 */
export async function withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number,
    baseDelay: number,
    operationName: string
): Promise<T> {
    let lastError: any;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            if (attempt > 1) {
                console.log(`[DAYTONA] Retry attempt ${attempt}/${maxRetries} for ${operationName}...`);
            }
            return await operation();
        } catch (error) {
            lastError = error;
            const isLastAttempt = attempt === maxRetries;

            if (isLastAttempt) {
                console.error(`[DAYTONA] Operation ${operationName} failed after ${maxRetries} attempts:`, error);
                throw error;
            }

            const delay = baseDelay * Math.pow(2, attempt - 1);
            console.warn(`[DAYTONA] ${operationName} failed (attempt ${attempt}): ${error instanceof Error ? error.message : String(error)}. Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    throw lastError;
}

/**
 * Timeout wrapper for promises
 */
export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operationName: string): Promise<T> {
    let timer: NodeJS.Timeout;
    const timeoutPromise = new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
            reject(new Error(`${operationName} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
    });

    try {
        const result = await Promise.race([promise, timeoutPromise]);
        clearTimeout(timer!);
        return result;
    } catch (error) {
        clearTimeout(timer!);
        throw error;
    }
}

/**
 * Map template/language names to Daytona-supported languages
 */
export function normalizeDaytonaLanguage(language?: string): string {
    if (!language) return 'typescript';

    const normalized = language.toLowerCase().trim();

    // Map various template names to supported languages
    const languageMap: Record<string, string> = {
        // TypeScript variants
        'typescript': 'typescript',
        'ts': 'typescript',
        'encore': 'typescript',
        'encore-solid': 'typescript',
        'encore-react': 'typescript',
        'nextjs': 'typescript',
        'next': 'typescript',
        'react': 'typescript',
        'solid': 'typescript',
        'solidjs': 'typescript',
        'vue': 'typescript',
        'angular': 'typescript',
        'svelte': 'typescript',
        'node': 'typescript',
        'nodejs': 'typescript',

        // JavaScript variants
        'javascript': 'javascript',
        'js': 'javascript',

        // Python variants
        'python': 'python',
        'py': 'python',
        'python3': 'python',
        'django': 'python',
        'flask': 'python',
        'fastapi': 'python',

        // Go (map to typescript - user can install Go via terminal)
        'go': 'typescript',
        'golang': 'typescript',
        'gin': 'typescript',

        // Rust (map to typescript - user can install Rust via terminal)
        'rust': 'typescript',
        'rs': 'typescript',

        // Dart/Flutter (map to typescript - user can install Flutter SDK via terminal)
        'dart': 'typescript',
        'flutter': 'typescript',

        // Java (map to typescript - user can install JDK via terminal)
        'java': 'typescript',

        // C# (map to typescript - user can install .NET SDK via terminal)
        'csharp': 'typescript',
        'c#': 'typescript',
        'dotnet': 'typescript',

        // PHP (map to typescript - user can install PHP via terminal)
        'php': 'typescript',
        'laravel': 'typescript',

        // Ruby (map to typescript - user can install Ruby via terminal)
        'ruby': 'typescript',
        'rails': 'typescript',

        // Kotlin (map to typescript - user can install Kotlin via terminal)
        'kotlin': 'typescript',

        // Swift (map to typescript - user can install Swift via terminal)
        'swift': 'typescript',

        // C/C++ (map to typescript - compilers available in most images)
        'c': 'typescript',
        'cpp': 'typescript',
        'c++': 'typescript',
    };

    const mapped = languageMap[normalized];
    if (mapped) {
        if (mapped !== normalized) {
            console.log(`[DAYTONA] Mapped language '${language}' -> '${mapped}' (base image)`);
        }
        return mapped;
    }

    // Default to typescript for unknown languages
    console.log(`[DAYTONA] Unknown language '${language}', defaulting to 'typescript' base image`);
    return 'typescript';
}
