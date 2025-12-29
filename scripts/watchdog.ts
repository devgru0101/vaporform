import { spawn, ChildProcess } from 'child_process';
import http from 'http';

/**
 * Vaporform Backend Watchdog
 * 
 * PURPOSE:
 * Monitors the Encore backend and keeps it running by automatically restarting it if it crashes
 * or becomes unresponsive. This is essential for development environments where the backend may
 * crash due to code errors, dependency issues, or resource exhaustion.
 * 
 * FEATURES:
 * - Automatic restart on crash or unresponsiveness
 * - Network binding to 0.0.0.0 for remote development access
 * - Health check monitoring every 5 seconds
 * - Graceful shutdown on SIGINT/SIGTERM
 * - Restart throttling to prevent infinite restart loops
 * - Hung process detection and recovery
 * 
 * CONFIGURATION:
 * Adjust the constants below to tune behavior for your environment.
 */

// ===== CONFIGURATION =====
const BACKEND_URL = 'http://127.0.0.1:4000';           // Health check endpoint
const CHECK_INTERVAL_MS = 5000;                         // How often to check health (5s)
const STARTUP_GRACE_PERIOD_MS = 10000;                  // Wait 10s after start before health checks
const MAX_RESTART_ATTEMPTS = 5;                         // Max restarts in time window
const RESTART_WINDOW_MS = 60000;                        // Time window for restart limiting (1min)
const HUNG_PROCESS_THRESHOLD = 3;                       // Failed health checks before killing hung process

// ===== STATE =====
let backendProcess: ChildProcess | null = null;
let isShuttingDown = false;
let isStarting = false;
let restartTimes: number[] = [];                        // Timestamps of recent restarts
let failedHealthChecks = 0;                             // Counter for consecutive failed checks

/**
 * Health Check Function
 * 
 * Attempts to connect to the backend HTTP endpoint to verify it's responsive.
 * Returns true if the server responds (any status code), false otherwise.
 */
function checkHealth(): Promise<boolean> {
    return new Promise((resolve) => {
        const req = http.get(BACKEND_URL, (res) => {
            // Any response code means the server is listening and responsive
            resolve(true);
        });

        req.on('error', (err) => {
            // Connection refused, timeout, or other network error
            resolve(false);
        });

        // Set timeout to avoid hanging forever
        req.setTimeout(3000, () => {
            req.destroy();
            resolve(false);
        });

        req.end();
    });
}

/**
 * Check Restart Rate Limit
 * 
 * Prevents infinite restart loops by limiting restarts to MAX_RESTART_ATTEMPTS
 * within the RESTART_WINDOW_MS time window.
 * 
 * @returns true if restart is allowed, false if rate limit exceeded
 */
function canRestart(): boolean {
    const now = Date.now();

    // Remove restart times outside the window
    restartTimes = restartTimes.filter(time => now - time < RESTART_WINDOW_MS);

    if (restartTimes.length >= MAX_RESTART_ATTEMPTS) {
        console.error(`[Watchdog] ❌ Restart rate limit exceeded! ${MAX_RESTART_ATTEMPTS} restarts in ${RESTART_WINDOW_MS / 1000}s.`);
        console.error(`[Watchdog] Backend is crash-looping. Please check logs and fix the issue.`);
        return false;
    }

    restartTimes.push(now);
    return true;
}

/**
 * Start Encore Backend
 * 
 * Spawns the Encore backend process with network binding to 0.0.0.0 for remote access.
 * 
 * NETWORK BINDING EXPLAINED:
 * - 127.0.0.1 (localhost): Only accessible from the same machine
 * - 0.0.0.0 (all interfaces): Accessible from any network interface, including remote machines
 * 
 * For remote development (e.g., SSH, remote desktop), 0.0.0.0 is essential.
 * In production, use proper firewall rules and reverse proxies (nginx, Cloudflare).
 */
function startBackend() {
    if (isShuttingDown || isStarting) return;

    if (!canRestart()) {
        console.error('[Watchdog] Giving up on restarts. Exiting.');
        process.exit(1);
    }

    console.log('[Watchdog] 🚀 Starting Encore backend...');
    isStarting = true;
    failedHealthChecks = 0; // Reset counter

    backendProcess = spawn('encore', ['run', '--listen=0.0.0.0:4000'], {
        stdio: 'inherit',
        shell: true
    });

    backendProcess.on('exit', (code, signal) => {
        console.log(`[Watchdog] ⚠️  Backend process exited with code ${code} signal ${signal}`);
        backendProcess = null;
        isStarting = false;
    });

    backendProcess.on('error', (err) => {
        console.error('[Watchdog] ❌ Failed to spawn backend:', err);
        isStarting = false;
    });

    // Grace period: Don't check health immediately after starting
    setTimeout(() => {
        isStarting = false;
        console.log('[Watchdog] ✓ Startup grace period complete');
    }, STARTUP_GRACE_PERIOD_MS);
}

/**
 * Stop Backend
 * 
 * Gracefully kills the backend process if running.
 */
function stopBackend() {
    if (backendProcess) {
        console.log('[Watchdog] 🛑 Stopping backend process...');
        backendProcess.kill('SIGTERM');

        // Force kill if it doesn't stop within 5s
        setTimeout(() => {
            if (backendProcess) {
                console.log('[Watchdog] Force killing backend...');
                backendProcess.kill('SIGKILL');
            }
        }, 5000);

        backendProcess = null;
    }
}

/**
 * Main Monitoring Loop
 * 
 * Continuously checks backend health and restarts if necessary.
 * 
 * HUNG PROCESS DETECTION:
 * If the process exists but fails health checks HUNG_PROCESS_THRESHOLD times,
 * we assume it's hung and force a restart.
 */
async function monitor() {
    if (isShuttingDown) return;

    if (isStarting) {
        // Skip check during startup grace period
        setTimeout(monitor, CHECK_INTERVAL_MS);
        return;
    }

    const isHealthy = await checkHealth();

    if (!isHealthy) {
        failedHealthChecks++;

        if (!backendProcess) {
            // Process doesn't exist - start it
            console.log(`[Watchdog] ⚠️  Backend not running (${failedHealthChecks} failed checks). Starting...`);
            failedHealthChecks = 0;
            startBackend();
        } else {
            // Process exists but health check failed - might be hung
            console.log(`[Watchdog] ⚠️  Backend process exists but health check failed (${failedHealthChecks}/${HUNG_PROCESS_THRESHOLD})`);

            if (failedHealthChecks >= HUNG_PROCESS_THRESHOLD) {
                console.log('[Watchdog] ❌ Backend appears to be hung. Forcing restart...');
                stopBackend();
                failedHealthChecks = 0;
                // Will be restarted on next tick
            }
        }
    } else {
        // Healthy - reset counter
        if (failedHealthChecks > 0) {
            console.log('[Watchdog] ✓ Backend recovered');
        }
        failedHealthChecks = 0;
    }

    setTimeout(monitor, CHECK_INTERVAL_MS);
}

// ===== SIGNAL HANDLERS =====
process.on('SIGINT', () => {
    console.log('\n[Watchdog] Received SIGINT. Shutting down...');
    isShuttingDown = true;
    stopBackend();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n[Watchdog] Received SIGTERM. Shutting down...');
    isShuttingDown = true;
    stopBackend();
    process.exit(0);
});

// ===== START =====
console.log('═'.repeat(60));
console.log('[Watchdog] Vaporform Backend Watchdog Started');
console.log(`[Watchdog] Monitoring: ${BACKEND_URL}`);
console.log(`[Watchdog] Check interval: ${CHECK_INTERVAL_MS}ms`);
console.log(`[Watchdog] Max restarts: ${MAX_RESTART_ATTEMPTS}/${RESTART_WINDOW_MS / 1000}s`);
console.log('═'.repeat(60));
monitor();
