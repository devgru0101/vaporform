/**
 * Utility functions for Vaporform
 */

import { SUBDOMAIN_REGEX } from './constants.js';

/**
 * Generate a random subdomain-safe string (cryptographically secure)
 */
export function generateSubdomain(projectName: string): string {
  const sanitized = projectName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  // Use crypto for secure randomness
  const { randomBytes } = require('crypto');
  const random = randomBytes(4).toString('hex');
  return `${sanitized}-${random}`;
}

/**
 * Validate subdomain format
 */
export function isValidSubdomain(subdomain: string): boolean {
  return SUBDOMAIN_REGEX.test(subdomain);
}

/**
 * Generate a unique project slug
 */
export function generateProjectSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
}

/**
 * Validate file extension
 */
export function isAllowedFileExtension(filename: string, allowedExtensions: string[]): boolean {
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext ? allowedExtensions.includes(ext) : false;
}

/**
 * Get MIME type from filename
 */
export function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();

  const mimeTypes: Record<string, string> = {
    // Code
    js: 'application/javascript',
    ts: 'application/typescript',
    tsx: 'application/typescript',
    jsx: 'application/javascript',
    json: 'application/json',
    py: 'text/x-python',
    java: 'text/x-java',
    go: 'text/x-go',
    rs: 'text/x-rust',
    c: 'text/x-c',
    cpp: 'text/x-c++',
    h: 'text/x-c',
    // Web
    html: 'text/html',
    css: 'text/css',
    scss: 'text/x-scss',
    less: 'text/x-less',
    // Config
    yml: 'text/yaml',
    yaml: 'text/yaml',
    toml: 'text/x-toml',
    xml: 'application/xml',
    // Docs
    md: 'text/markdown',
    txt: 'text/plain',
    pdf: 'application/pdf',
    // Images
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    webp: 'image/webp',
    // Other
    sh: 'application/x-sh',
    sql: 'application/sql',
  };

  return mimeTypes[ext || ''] || 'application/octet-stream';
}

import path from 'path';

/**
 * Normalize file path and prevent directory traversal
 */
export function normalizePath(p: string): string {
  // Ensure we're working with forward slashes for consistency
  const forwardSlashed = p.replace(/\\/g, '/');

  // treat all paths as absolute from root to handle '..' correctly
  const absolutePath = forwardSlashed.startsWith('/') ? forwardSlashed : '/' + forwardSlashed;

  // Resolve '..' and '.'
  // path.posix.normalize('/../../foo') will return '/foo' (staying at root)
  // path.posix.normalize('/../') will return '/'
  const normalized = path.posix.normalize(absolutePath);

  return normalized;
}

/**
 * Get parent path
 */
export function getParentPath(path: string): string {
  const normalized = normalizePath(path);
  const parts = normalized.split('/').filter(Boolean);
  return parts.length > 1 ? '/' + parts.slice(0, -1).join('/') : '/';
}

/**
 * Get filename from path
 */
export function getFilename(path: string): string {
  const parts = path.split('/').filter(Boolean);
  return parts[parts.length - 1] || '';
}

/**
 * Format bytes to human readable
 */
export function formatBytes(bytes: number | bigint): string {
  const b = typeof bytes === 'bigint' ? Number(bytes) : bytes;

  if (b === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(b) / Math.log(k));

  return Math.round((b / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Format minutes to human readable duration
 */
export function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

/**
 * Generate unique ID (cryptographically secure)
 */
export function generateId(): string {
  // Use crypto for secure randomness
  const { randomBytes } = require('crypto');
  return `${Date.now()}_${randomBytes(6).toString('hex')}`;
}

/**
 * Sleep utility
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  let lastError: Error;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (i < maxRetries - 1) {
        await sleep(delayMs * Math.pow(2, i));
      }
    }
  }

  throw lastError!;
}
