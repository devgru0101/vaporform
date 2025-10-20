/**
 * Application constants for Vaporform
 */

// API versioning
export const API_VERSION = 'v1';

// File system limits
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB per file
export const MAX_FILENAME_LENGTH = 255;
export const GRIDFS_CHUNK_SIZE = 255 * 1024; // 255KB

// Allowed file extensions
export const ALLOWED_FILE_EXTENSIONS = [
  // Code
  'js', 'ts', 'tsx', 'jsx', 'json',
  'py', 'java', 'go', 'rs', 'c', 'cpp', 'h',
  // Web
  'html', 'css', 'scss', 'less', 'sass',
  // Config
  'yml', 'yaml', 'toml', 'xml', 'env',
  // Docs
  'md', 'txt', 'pdf',
  // Images
  'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp',
  // Other
  'sh', 'sql', 'graphql', 'proto',
];

// Git
export const MAX_COMMIT_MESSAGE_LENGTH = 500;
export const DEFAULT_BRANCH = 'main';

// AI / KiloCode
export const OPENAI_MODEL = 'gpt-4-turbo-preview';
export const EMBEDDING_MODEL = 'text-embedding-3-small';
export const EMBEDDING_DIMENSIONS = 1536;
export const MAX_CONTEXT_MESSAGES = 20;
export const MAX_RAG_RESULTS = 5;

// Qdrant
export const QDRANT_COLLECTION_PREFIX = 'tenant_';

// Daytona
export const DAYTONA_LANGUAGE = 'typescript';
export const DAYTONA_PORT_RANGE_START = 3000;
export const DAYTONA_PORT_RANGE_END = 9999;

// Docker
export const DOCKER_IMAGE_NODE = 'node:20-alpine';
export const DOCKER_NETWORK_NAME = 'vaporform-network';
export const DOCKER_MEMORY_LIMIT_FREE = '512m';
export const DOCKER_MEMORY_LIMIT_PRO = '2g';
export const DOCKER_MEMORY_LIMIT_TEAM = '4g';
export const DOCKER_CPU_LIMIT_FREE = '0.5';
export const DOCKER_CPU_LIMIT_PRO = '2';
export const DOCKER_CPU_LIMIT_TEAM = '4';

// Deployment
export const SUBDOMAIN_REGEX = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
export const BASE_DOMAIN = 'vaporform.dev';

// Rate limiting
export const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
export const RATE_LIMIT_MAX_REQUESTS_FREE = 100;
export const RATE_LIMIT_MAX_REQUESTS_PRO = 1000;
export const RATE_LIMIT_MAX_REQUESTS_TEAM = 5000;

// WebSocket
export const WS_HEARTBEAT_INTERVAL = 30000; // 30 seconds
export const WS_RECONNECT_DELAY = 3000; // 3 seconds

// Billing
export const FREE_TIER_PROJECT_LIMIT = 3;
export const FREE_TIER_STORAGE_LIMIT = 1 * 1024 * 1024 * 1024; // 1GB
export const FREE_TIER_COMPUTE_LIMIT = 10 * 60; // 10 hours in minutes

// Port allocation
export const RESERVED_PORTS = [22, 80, 443, 3000, 4000, 5432, 6379, 8080, 9400, 9900];

// Templates
export const PROJECT_TEMPLATES = {
  'react-vite': {
    name: 'React + Vite',
    description: 'React application with Vite build tool',
    files: {
      'package.json': {
        name: 'my-react-app',
        scripts: {
          dev: 'vite',
          build: 'vite build',
          preview: 'vite preview',
        },
        dependencies: {
          react: '^18.2.0',
          'react-dom': '^18.2.0',
        },
        devDependencies: {
          '@vitejs/plugin-react': '^4.2.0',
          vite: '^5.0.0',
        },
      },
    },
  },
  'nextjs': {
    name: 'Next.js',
    description: 'Next.js with App Router',
    files: {
      'package.json': {
        name: 'my-next-app',
        scripts: {
          dev: 'next dev',
          build: 'next build',
          start: 'next start',
        },
        dependencies: {
          next: '^14.0.0',
          react: '^18.2.0',
          'react-dom': '^18.2.0',
        },
      },
    },
  },
  'express': {
    name: 'Express.js',
    description: 'Node.js Express server',
    files: {
      'package.json': {
        name: 'my-express-app',
        scripts: {
          dev: 'nodemon src/index.js',
          start: 'node src/index.js',
        },
        dependencies: {
          express: '^4.18.0',
        },
        devDependencies: {
          nodemon: '^3.0.0',
        },
      },
    },
  },
};

// Error messages
export const ERROR_MESSAGES = {
  UNAUTHORIZED: 'Unauthorized access',
  FORBIDDEN: 'Insufficient permissions',
  NOT_FOUND: 'Resource not found',
  PROJECT_LIMIT_REACHED: 'Project limit reached for your subscription tier',
  STORAGE_LIMIT_REACHED: 'Storage limit reached for your subscription tier',
  COMPUTE_LIMIT_REACHED: 'Compute limit reached for your subscription tier',
  INVALID_FILE_TYPE: 'File type not allowed',
  FILE_TOO_LARGE: 'File size exceeds maximum allowed',
  INVALID_PROJECT_NAME: 'Invalid project name',
  PROJECT_ALREADY_EXISTS: 'Project with this name already exists',
  INVALID_SUBDOMAIN: 'Invalid subdomain format',
  SUBDOMAIN_TAKEN: 'Subdomain already in use',
};
