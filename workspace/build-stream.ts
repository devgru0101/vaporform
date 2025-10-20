/**
 * Build Stream Manager - WebSocket-based real-time build log streaming
 * Provides live build status and log updates to connected clients
 */

import { api } from 'encore.dev/api';
import { db } from './daytona-manager.js';
import { buildManager } from './build-manager.js';

// In-memory subscription tracking
const buildSubscriptions = new Map<string, Set<(data: any) => void>>();

export interface BuildStreamEvent {
  type: 'status' | 'event' | 'log' | 'error' | 'complete';
  build_id: string;
  timestamp: Date;
  data: any;
}

/**
 * Subscribe to build updates
 * Returns unsubscribe function
 */
export function subscribeToBuild(
  buildId: string,
  callback: (event: BuildStreamEvent) => void
): () => void {
  const buildIdStr = buildId.toString();

  if (!buildSubscriptions.has(buildIdStr)) {
    buildSubscriptions.set(buildIdStr, new Set());
  }

  buildSubscriptions.get(buildIdStr)!.add(callback);

  console.log(`[Build Stream] Client subscribed to build ${buildId}`);

  // Return unsubscribe function
  return () => {
    const subscribers = buildSubscriptions.get(buildIdStr);
    if (subscribers) {
      subscribers.delete(callback);
      if (subscribers.size === 0) {
        buildSubscriptions.delete(buildIdStr);
        console.log(`[Build Stream] No more subscribers for build ${buildId}`);
      }
    }
  };
}

/**
 * Broadcast event to all subscribers of a build
 */
export function broadcastBuildEvent(buildId: string, event: BuildStreamEvent): void {
  const buildIdStr = buildId.toString();
  const subscribers = buildSubscriptions.get(buildIdStr);

  if (!subscribers || subscribers.size === 0) {
    return;
  }

  console.log(`[Build Stream] Broadcasting ${event.type} to ${subscribers.size} subscriber(s)`);

  subscribers.forEach(callback => {
    try {
      callback(event);
    } catch (error) {
      console.error(`[Build Stream] Error in subscriber callback:`, error);
    }
  });
}

/**
 * Start monitoring a build and broadcast updates
 * This should be called when a build is created
 */
export async function startBuildMonitoring(buildId: bigint): Promise<void> {
  const buildIdStr = buildId.toString();

  console.log(`[Build Stream] Starting monitoring for build ${buildId}`);

  // Poll for updates every 2 seconds
  const interval = setInterval(async () => {
    try {
      // Check if anyone is still subscribed
      if (!buildSubscriptions.has(buildIdStr)) {
        console.log(`[Build Stream] No subscribers for build ${buildId}, stopping monitoring`);
        clearInterval(interval);
        return;
      }

      // Get latest build status
      const build = await buildManager.getBuild(buildId);

      // Broadcast status update
      broadcastBuildEvent(buildIdStr, {
        type: 'status',
        build_id: buildIdStr,
        timestamp: new Date(),
        data: {
          status: build.status,
          phase: build.phase,
          current_step: build.current_step,
          total_steps: build.total_steps,
          duration_ms: build.duration_ms,
          error_message: build.error_message
        }
      });

      // Get new events since last check
      const events = await buildManager.getBuildEvents(buildId, 10);

      // Broadcast recent events
      events.slice(-5).forEach(event => {
        broadcastBuildEvent(buildIdStr, {
          type: 'event',
          build_id: buildIdStr,
          timestamp: event.timestamp,
          data: {
            event_type: event.event_type,
            phase: event.phase,
            message: event.message,
            metadata: event.metadata
          }
        });
      });

      // Broadcast live output if available
      if (build.live_output) {
        const recentOutput = build.live_output.slice(-1000); // Last 1000 chars

        broadcastBuildEvent(buildIdStr, {
          type: 'log',
          build_id: buildIdStr,
          timestamp: new Date(),
          data: {
            output: recentOutput
          }
        });
      }

      // If build is complete or failed, stop monitoring
      if (build.status === 'success' || build.status === 'failed') {
        console.log(`[Build Stream] Build ${buildId} ${build.status}, sending final update`);

        broadcastBuildEvent(buildIdStr, {
          type: 'complete',
          build_id: buildIdStr,
          timestamp: new Date(),
          data: {
            status: build.status,
            phase: build.phase,
            duration_ms: build.duration_ms,
            error_message: build.error_message,
            install_logs: build.install_logs,
            build_logs: build.build_logs
          }
        });

        // Stop monitoring after 30 seconds
        setTimeout(() => {
          clearInterval(interval);
          console.log(`[Build Stream] Stopped monitoring build ${buildId}`);
        }, 30000);
      }
    } catch (error) {
      console.error(`[Build Stream] Error monitoring build ${buildId}:`, error);
    }
  }, 2000); // Poll every 2 seconds
}

/**
 * Enhanced build manager wrapper that includes streaming
 */
export class StreamingBuildManager {
  /**
   * Create and start a build with streaming enabled
   */
  async createAndStartBuild(
    projectId: bigint,
    workspaceId: bigint,
    metadata?: Record<string, any>
  ): Promise<{ build_id: string; stream_started: boolean }> {
    // Create build
    const build = await buildManager.createBuild(projectId, workspaceId, metadata);

    // Start streaming
    startBuildMonitoring(build.id).catch(err => {
      console.error(`Failed to start build monitoring:`, err);
    });

    // Start build process
    buildManager.startBuild(build.id).catch(err => {
      console.error(`Build ${build.id} failed:`, err);
    });

    return {
      build_id: build.id.toString(),
      stream_started: true
    };
  }

  /**
   * Get build status with streaming info
   */
  async getBuildStatus(buildId: bigint): Promise<any> {
    const build = await buildManager.getBuild(buildId);
    const events = await buildManager.getBuildEvents(buildId, 50);

    const buildIdStr = buildId.toString();
    const hasActiveSubscribers = buildSubscriptions.has(buildIdStr) &&
      buildSubscriptions.get(buildIdStr)!.size > 0;

    return {
      build_id: buildIdStr,
      status: build.status,
      phase: build.phase,
      current_step: build.current_step,
      total_steps: build.total_steps,
      daytona_session_id: build.daytona_session_id,
      install_logs: build.install_logs,
      build_logs: build.build_logs,
      live_output: build.live_output,
      error_message: build.error_message,
      duration_ms: build.duration_ms,
      metadata: build.metadata,
      events: events.map(e => ({
        type: e.event_type,
        phase: e.phase,
        message: e.message,
        timestamp: e.timestamp,
        metadata: e.metadata
      })),
      streaming: {
        active: hasActiveSubscribers,
        subscriber_count: hasActiveSubscribers ? buildSubscriptions.get(buildIdStr)!.size : 0
      }
    };
  }
}

export const streamingBuildManager = new StreamingBuildManager();
