/**
 * Usage Tracker
 * Tracks resource usage for billing and quota enforcement
 */

import { SQLDatabase } from 'encore.dev/storage/sqldb';
import type { SubscriptionLimits } from '../shared/types.js';
import { SUBSCRIPTION_LIMITS } from '../shared/types.js';
import { QuotaExceededError } from '../shared/errors.js';

const db = new SQLDatabase('billing', {
  migrations: './migrations',
});

type ResourceType = 'storage' | 'compute' | 'bandwidth' | 'ai_tokens';

interface UsageRecord {
  id: bigint;
  project_id: bigint;
  user_id: string;
  resource_type: ResourceType;
  amount: bigint;
  unit: string;
  period_start: Date;
  period_end: Date;
  created_at: Date;
}

interface QuotaAlert {
  id: bigint;
  project_id: bigint;
  user_id: string;
  resource_type: string;
  threshold_percent: number;
  current_usage: bigint;
  quota_limit: bigint;
  alerted_at: Date;
  acknowledged: boolean;
}

interface BillingCycle {
  id: bigint;
  user_id: string;
  subscription_tier: string;
  period_start: Date;
  period_end: Date;
  total_storage_bytes: bigint;
  total_compute_minutes: number;
  total_ai_tokens: bigint;
  total_bandwidth_bytes: bigint;
  amount_cents?: number;
  status: 'active' | 'ended' | 'paid';
  created_at: Date;
}

export class UsageTracker {
  /**
   * Record usage for a resource
   */
  async recordUsage(
    projectId: bigint,
    userId: string,
    resourceType: ResourceType,
    amount: bigint,
    unit: string,
    periodStart: Date = new Date(),
    periodEnd: Date = new Date()
  ): Promise<UsageRecord> {
    const record = await db.queryRow<UsageRecord>`
      INSERT INTO usage_records (
        project_id,
        user_id,
        resource_type,
        amount,
        unit,
        period_start,
        period_end
      ) VALUES (
        ${projectId},
        ${userId},
        ${resourceType},
        ${amount},
        ${unit},
        ${periodStart},
        ${periodEnd}
      )
      RETURNING *
    `;

    if (!record) {
      throw new Error('Failed to record usage');
    }

    return record;
  }

  /**
   * Get storage usage for a project
   */
  async getStorageUsage(projectId: bigint): Promise<bigint> {
    // Get total size from file_metadata
    const result = await db.query`
      SELECT COALESCE(SUM(size_bytes), 0) as total
      FROM vfs.file_metadata
      WHERE project_id = ${projectId}
      AND is_directory = false
      AND deleted_at IS NULL
    `;

    const row = await result.next();
    if (row.done) return BigInt(0);

    return row.value.total as bigint;
  }

  /**
   * Get compute usage for a project (from workspace builds)
   */
  async getComputeUsage(projectId: bigint, periodStart: Date, periodEnd: Date): Promise<number> {
    // Sum duration from builds
    const result = await db.query<{ total_minutes: number }>`
      SELECT COALESCE(SUM(duration_ms) / 60000, 0) as total_minutes
      FROM workspace.builds
      WHERE project_id = ${projectId}
      AND completed_at >= ${periodStart}
      AND completed_at <= ${periodEnd}
    `;

    const row = await result.next();
    if (row.done) return 0;

    return Math.ceil(row.value.total_minutes);
  }

  /**
   * Check if usage is within quota
   */
  async checkQuota(
    userId: string,
    subscriptionTier: string,
    resourceType: ResourceType,
    requestedAmount: bigint
  ): Promise<{ allowed: boolean; reason?: string; currentUsage: bigint; limit: bigint }> {
    const limits = SUBSCRIPTION_LIMITS[subscriptionTier];

    if (!limits) {
      return {
        allowed: false,
        reason: 'Invalid subscription tier',
        currentUsage: BigInt(0),
        limit: BigInt(0),
      };
    }

    // Get current usage for the billing period
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1); // First day of month
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0); // Last day of month

    let currentUsage = BigInt(0);
    let limit = BigInt(0);

    switch (resourceType) {
      case 'storage':
        // Get total storage across all user's projects
        const storageResult = await db.query<{ total: bigint }>`
          SELECT COALESCE(SUM(fm.size_bytes), 0) as total
          FROM vfs.file_metadata fm
          JOIN projects.projects p ON fm.project_id = p.id
          WHERE p.clerk_user_id = ${userId}
          AND fm.is_directory = false
          AND fm.deleted_at IS NULL
        `;

        const storageRow = await storageResult.next();
        currentUsage = storageRow.done ? BigInt(0) : (storageRow.value.total as bigint);
        limit = limits.maxStorageBytes;
        break;

      case 'compute':
        // Get total compute minutes for the current billing period
        const computeResult = await db.query<{ total: bigint }>`
          SELECT COALESCE(SUM(b.duration_ms), 0) / 60000 as total
          FROM workspace.builds b
          JOIN projects.projects p ON b.project_id = p.id
          WHERE p.clerk_user_id = ${userId}
          AND b.completed_at >= ${periodStart}
          AND b.completed_at <= ${periodEnd}
        `;

        const computeRow = await computeResult.next();
        currentUsage = computeRow.done ? BigInt(0) : BigInt(Math.ceil(Number(computeRow.value.total)));
        limit = BigInt(limits.maxComputeMinutesPerMonth);
        break;

      default:
        return {
          allowed: true,
          currentUsage: BigInt(0),
          limit: BigInt(0),
        };
    }

    const newTotal = currentUsage + requestedAmount;

    if (newTotal > limit) {
      return {
        allowed: false,
        reason: `${resourceType} quota exceeded. Current: ${currentUsage}, Limit: ${limit}, Requested: ${requestedAmount}`,
        currentUsage,
        limit,
      };
    }

    // Check if approaching threshold (80%)
    const threshold = (limit * BigInt(80)) / BigInt(100);
    if (newTotal > threshold && currentUsage <= threshold) {
      // Create quota alert
      await this.createQuotaAlert(
        BigInt(0), // Project ID not available here
        userId,
        resourceType,
        80,
        newTotal,
        limit
      );
    }

    return {
      allowed: true,
      currentUsage,
      limit,
    };
  }

  /**
   * Enforce quota before operation
   */
  async enforceQuota(
    userId: string,
    subscriptionTier: string,
    resourceType: ResourceType,
    requestedAmount: bigint
  ): Promise<void> {
    const check = await this.checkQuota(userId, subscriptionTier, resourceType, requestedAmount);

    if (!check.allowed) {
      throw new QuotaExceededError(check.reason || 'Quota exceeded');
    }
  }

  /**
   * Create a quota alert
   */
  async createQuotaAlert(
    projectId: bigint,
    userId: string,
    resourceType: string,
    thresholdPercent: number,
    currentUsage: bigint,
    quotaLimit: bigint
  ): Promise<QuotaAlert> {
    const alert = await db.queryRow<QuotaAlert>`
      INSERT INTO quota_alerts (
        project_id,
        user_id,
        resource_type,
        threshold_percent,
        current_usage,
        quota_limit
      ) VALUES (
        ${projectId},
        ${userId},
        ${resourceType},
        ${thresholdPercent},
        ${currentUsage},
        ${quotaLimit}
      )
      RETURNING *
    `;

    if (!alert) {
      throw new Error('Failed to create quota alert');
    }

    console.log(`⚠️  Quota alert: ${userId} at ${thresholdPercent}% for ${resourceType}`);

    return alert;
  }

  /**
   * Get unacknowledged quota alerts for a user
   */
  async getQuotaAlerts(userId: string): Promise<QuotaAlert[]> {
    const alerts: QuotaAlert[] = [];

    for await (const alert of db.query<QuotaAlert>`
      SELECT * FROM quota_alerts
      WHERE user_id = ${userId}
      AND acknowledged = false
      ORDER BY alerted_at DESC
    `) {
      alerts.push(alert);
    }

    return alerts;
  }

  /**
   * Acknowledge a quota alert
   */
  async acknowledgeAlert(alertId: bigint): Promise<void> {
    await db.exec`
      UPDATE quota_alerts
      SET acknowledged = true
      WHERE id = ${alertId}
    `;
  }

  /**
   * Get or create current billing cycle
   */
  async getCurrentBillingCycle(userId: string, subscriptionTier: string): Promise<BillingCycle> {
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Check if cycle exists
    const existing = await db.queryRow<BillingCycle>`
      SELECT * FROM billing_cycles
      WHERE user_id = ${userId}
      AND period_start = ${periodStart}
      AND period_end = ${periodEnd}
    `;

    if (existing) {
      return existing;
    }

    // Create new cycle
    const cycle = await db.queryRow<BillingCycle>`
      INSERT INTO billing_cycles (
        user_id,
        subscription_tier,
        period_start,
        period_end,
        status
      ) VALUES (
        ${userId},
        ${subscriptionTier},
        ${periodStart},
        ${periodEnd},
        'active'
      )
      RETURNING *
    `;

    if (!cycle) {
      throw new Error('Failed to create billing cycle');
    }

    return cycle;
  }

  /**
   * Update billing cycle with current usage
   */
  async updateBillingCycle(userId: string, subscriptionTier: string): Promise<BillingCycle> {
    const cycle = await this.getCurrentBillingCycle(userId, subscriptionTier);

    const now = new Date();

    // Calculate storage usage
    const storageResult = await db.query<{ total: bigint }>`
      SELECT COALESCE(SUM(fm.size_bytes), 0) as total
      FROM vfs.file_metadata fm
      JOIN projects.projects p ON fm.project_id = p.id
      WHERE p.clerk_user_id = ${userId}
      AND fm.is_directory = false
      AND fm.deleted_at IS NULL
    `;

    const storageRow = await storageResult.next();
    const totalStorage = storageRow.done ? BigInt(0) : (storageRow.value.total as bigint);

    // Calculate compute usage
    const computeResult = await db.query<{ total: number }>`
      SELECT COALESCE(SUM(duration_ms) / 60000, 0) as total
      FROM workspace.builds b
      JOIN projects.projects p ON b.project_id = p.id
      WHERE p.clerk_user_id = ${userId}
      AND b.completed_at >= ${cycle.period_start}
      AND b.completed_at <= ${cycle.period_end}
    `;

    const computeRow = await computeResult.next();
    const totalCompute = computeRow.done ? 0 : Math.ceil(computeRow.value.total);

    // Update cycle
    await db.exec`
      UPDATE billing_cycles
      SET
        total_storage_bytes = ${totalStorage},
        total_compute_minutes = ${totalCompute}
      WHERE id = ${cycle.id}
    `;

    const updated = await db.queryRow<BillingCycle>`
      SELECT * FROM billing_cycles WHERE id = ${cycle.id}
    `;

    if (!updated) {
      throw new Error('Failed to update billing cycle');
    }

    return updated;
  }

  /**
   * Get billing cycles for a user
   */
  async getBillingCycles(userId: string, limit: number = 12): Promise<BillingCycle[]> {
    const cycles: BillingCycle[] = [];

    for await (const cycle of db.query<BillingCycle>`
      SELECT * FROM billing_cycles
      WHERE user_id = ${userId}
      ORDER BY period_start DESC
      LIMIT ${limit}
    `) {
      cycles.push(cycle);
    }

    return cycles;
  }
}

// Singleton instance
export const usageTracker = new UsageTracker();
