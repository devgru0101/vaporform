/**
 * Input Validation and Sanitization Utilities
 * Prevents injection attacks and validates user input
 */

import { ValidationError } from './errors.js';

/**
 * Validate and sanitize file path
 * Prevents directory traversal attacks
 */
export function validateFilePath(path: string): string {
    if (!path || typeof path !== 'string') {
        throw new ValidationError('Invalid file path');
    }

    // Remove leading/trailing whitespace
    path = path.trim();

    // Check for directory traversal attempts
    if (path.includes('..') || path.includes('~')) {
        throw new ValidationError('Directory traversal not allowed');
    }

    // Check for absolute paths (should be relative)
    if (path.startsWith('/') && !path.startsWith('/project')) {
        // Allow /project prefix for explicit project root references
        path = path.substring(1); // Remove leading slash
    }

    // Check for null bytes
    if (path.includes('\0')) {
        throw new ValidationError('Null bytes not allowed in file paths');
    }

    // Validate path length
    if (path.length > 1000) {
        throw new ValidationError('File path too long (max 1000 characters)');
    }

    return path;
}

/**
 * Escape shell argument for safe command execution
 * Prevents command injection
 */
export function escapeShellArg(arg: string): string {
    if (!arg || typeof arg !== 'string') {
        return "''";
    }

    // Replace single quotes with '\'' (end quote, escaped quote, start quote)
    return `'${arg.replace(/'/g, "'\\''")}'`;
}

/**
 * Validate shell command
 * Prevents dangerous command patterns
 */
export function validateCommand(command: string): void {
    if (!command || typeof command !== 'string') {
        throw new ValidationError('Invalid command');
    }

    // Check for dangerous patterns
    const dangerousPatterns = [
        /rm\s+-rf\s+\/(?!tmp|var\/tmp)/,  // rm -rf / (except /tmp)
        />\s*\/dev\/sd[a-z]/,              // Writing to disk devices
        /mkfs/,                             // Filesystem formatting
        /dd\s+if=/,                         // Direct disk operations
        /:\(\)\{.*\|.*&\s*\}/,             // Fork bombs
        /curl.*\|\s*bash/,                  // Pipe to bash (potential RCE)
        /wget.*\|\s*sh/,                    // Pipe to sh (potential RCE)
    ];

    for (const pattern of dangerousPatterns) {
        if (pattern.test(command)) {
            throw new ValidationError(`Dangerous command pattern detected: ${pattern.source}`);
        }
    }

    // Check command length
    if (command.length > 10000) {
        throw new ValidationError('Command too long (max 10000 characters)');
    }
}

/**
 * Validate package name
 * Prevents malicious package names
 */
export function validatePackageName(packageName: string): string {
    if (!packageName || typeof packageName !== 'string') {
        throw new ValidationError('Invalid package name');
    }

    packageName = packageName.trim();

    // Check for valid npm package name format
    // Allows: @scope/package-name, package-name, package_name
    const validPattern = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

    if (!validPattern.test(packageName)) {
        throw new ValidationError('Invalid package name format');
    }

    // Check length
    if (packageName.length > 214) {
        throw new ValidationError('Package name too long (max 214 characters)');
    }

    return packageName;
}

/**
 * Validate Git URL
 * Ensures safe Git repository URLs
 */
export function validateGitUrl(url: string): string {
    if (!url || typeof url !== 'string') {
        throw new ValidationError('Invalid Git URL');
    }

    url = url.trim();

    // Allow HTTPS and SSH Git URLs
    const validPatterns = [
        /^https:\/\/github\.com\/[\w-]+\/[\w.-]+\.git$/,
        /^https:\/\/gitlab\.com\/[\w-]+\/[\w.-]+\.git$/,
        /^https:\/\/bitbucket\.org\/[\w-]+\/[\w.-]+\.git$/,
        /^git@github\.com:[\w-]+\/[\w.-]+\.git$/,
        /^git@gitlab\.com:[\w-]+\/[\w.-]+\.git$/,
    ];

    const isValid = validPatterns.some(pattern => pattern.test(url));

    if (!isValid) {
        throw new ValidationError('Invalid or unsupported Git URL. Only GitHub, GitLab, and Bitbucket are supported.');
    }

    return url;
}

/**
 * Sanitize log message
 * Removes sensitive information from logs
 */
export function sanitizeLogMessage(message: string): string {
    if (!message || typeof message !== 'string') {
        return '';
    }

    // Remove potential API keys, tokens, passwords
    const patterns = [
        { pattern: /api[_-]?key[=:]\s*['"]?[\w-]{20,}['"]?/gi, replacement: 'api_key=***' },
        { pattern: /token[=:]\s*['"]?[\w-]{20,}['"]?/gi, replacement: 'token=***' },
        { pattern: /password[=:]\s*['"]?[^\s'"]{8,}['"]?/gi, replacement: 'password=***' },
        { pattern: /secret[=:]\s*['"]?[\w-]{20,}['"]?/gi, replacement: 'secret=***' },
        { pattern: /Bearer\s+[\w-]{20,}/gi, replacement: 'Bearer ***' },
    ];

    let sanitized = message;
    for (const { pattern, replacement } of patterns) {
        sanitized = sanitized.replace(pattern, replacement);
    }

    return sanitized;
}

/**
 * Validate JSON input
 * Safely parse and validate JSON
 */
export function validateJSON<T = any>(input: string, maxSize: number = 1024 * 1024): T {
    if (!input || typeof input !== 'string') {
        throw new ValidationError('Invalid JSON input');
    }

    if (input.length > maxSize) {
        throw new ValidationError(`JSON input too large (max ${maxSize} bytes)`);
    }

    try {
        return JSON.parse(input) as T;
    } catch (error) {
        throw new ValidationError('Invalid JSON format');
    }
}

/**
 * Validate port number
 */
export function validatePort(port: number): number {
    if (typeof port !== 'number' || !Number.isInteger(port)) {
        throw new ValidationError('Port must be an integer');
    }

    if (port < 1024 || port > 65535) {
        throw new ValidationError('Port must be between 1024 and 65535');
    }

    return port;
}

/**
 * Validate workspace ID
 */
export function validateWorkspaceId(id: string | bigint): bigint {
    try {
        const bigintId = typeof id === 'string' ? BigInt(id) : id;

        if (bigintId <= 0) {
            throw new ValidationError('Workspace ID must be positive');
        }

        return bigintId;
    } catch (error) {
        throw new ValidationError('Invalid workspace ID format');
    }
}

/**
 * Validate project ID
 */
export function validateProjectId(id: string | bigint): bigint {
    try {
        const bigintId = typeof id === 'string' ? BigInt(id) : id;

        if (bigintId <= 0) {
            throw new ValidationError('Project ID must be positive');
        }

        return bigintId;
    } catch (error) {
        throw new ValidationError('Invalid project ID format');
    }
}
