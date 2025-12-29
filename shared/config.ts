/**
 * Shared Configuration Constants
 * Centralized configuration for timeouts, intervals, and limits
 */

// ============================================================================
// Timeouts (in milliseconds)
// ============================================================================

export const TIMEOUTS = {
    // Workspace operations
    WORKSPACE_START: 60000,           // 60 seconds
    WORKSPACE_STOP: 30000,            // 30 seconds
    WORKSPACE_RESTART: 60000,         // 60 seconds
    WORKSPACE_DELETE: 30000,          // 30 seconds
    WORKSPACE_READY_POLL: 60000,      // 60 seconds max wait for ready

    // Command execution
    COMMAND_DEFAULT: 30000,           // 30 seconds
    COMMAND_BUILD: 300000,            // 5 minutes
    COMMAND_INSTALL: 180000,          // 3 minutes

    // PTY operations
    PTY_CREATE: 10000,                // 10 seconds
    PTY_SEND_INPUT: 5000,             // 5 seconds
    PTY_KILL: 5000,                   // 5 seconds

    // Network operations
    HEALTH_CHECK_RETRY: 1000,         // 1 second between retries
    FETCH_DEFAULT: 30000,             // 30 seconds

    // WebSocket
    WS_CONNECTION: 30000,             // 30 seconds to establish
    WS_HEARTBEAT: 30000,              // 30 seconds between heartbeats

    // Sync operations
    SYNC_INTERVAL: 5000,              // 5 seconds
    SYNC_DEBOUNCE: 1000,              // 1 second
    SANDBOX_ID_WAIT: 30000,           // 30 seconds max wait for sandbox ID
} as const;

// ============================================================================
// Retry Configuration
// ============================================================================

export const RETRY = {
    MAX_ATTEMPTS: 3,
    BACKOFF_BASE: 2000,               // 2 seconds base
    BACKOFF_MAX: 10000,               // 10 seconds max
    WORKSPACE_START: 3,
    WORKSPACE_RECOVERY: 3,
    SANDBOX_ID_WAIT: 10,
} as const;

// ============================================================================
// Limits
// ============================================================================

export const LIMITS = {
    // Database query limits
    MESSAGES_DEFAULT: 100,
    LOGS_DEFAULT: 100,
    BUILDS_DEFAULT: 20,
    SESSIONS_DEFAULT: 100,

    // File operations
    MAX_FILE_SIZE: 10 * 1024 * 1024,  // 10 MB
    MAX_FILES_PER_SYNC: 1000,

    // RAG/Vector search
    RAG_RESULTS: 5,
    RAG_SCORE_THRESHOLD: 0.65,

    // Build tracking
    BUILD_EVENTS_LIMIT: 100,
    BUILD_STEPS: 5,

    // Health checks
    HEALTH_CHECK_MAX_ATTEMPTS: 5,
    HEALTH_CHECK_EXTENDED: 8,
} as const;

// ============================================================================
// Ports
// ============================================================================

export const PORTS = {
    // Default application ports
    DEFAULT_WEB: 3000,
    VITE: 5173,
    VUE_CLI: 8080,
    ANGULAR: 4200,
    PYTHON_FLASK: 5000,
    PYTHON_DJANGO: 8000,

    // Infrastructure
    SSH_TERMINAL: 22222,
    WS_SSH_PROXY: 4003,

    // Port ranges
    MIN_PORT: 1024,
    MAX_PORT: 65535,
} as const;

// ============================================================================
// Auto-stop/Archive Intervals (in minutes)
// ============================================================================

export const AUTO_INTERVALS = {
    STOP_DEFAULT: 60,                 // 1 hour
    ARCHIVE_DEFAULT: 1440,            // 24 hours
    EPHEMERAL_STOP: 15,               // 15 minutes for ephemeral workspaces
} as const;

// ============================================================================
// Logging
// ============================================================================

export const LOGGING = {
    MAX_ERROR_LENGTH: 1000,
    MAX_LOG_CONTEXT: 500,
    TRUNCATE_SUFFIX: '...(truncated)',
} as const;

// ============================================================================
// Security
// ============================================================================

export const SECURITY = {
    SSH_TOKEN_EXPIRY_MINUTES: 60,     // 1 hour
    JWT_EXPIRY_HOURS: 24,             // 24 hours
    MAX_REQUEST_SIZE: 10 * 1024 * 1024, // 10 MB
} as const;
