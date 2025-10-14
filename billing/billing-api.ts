/**
 * Billing API endpoints
 * Provides usage tracking and quota management
 */

import { api, Header } from 'encore.dev/api';
import { verifyClerkJWT, getUserSubscriptionTier } from '../shared/clerk-auth.js';
import { usageTracker } from './usage-tracker.js';

interface GetQuotaStatusRequest {
  authorization: Header<'Authorization'>;
}

interface GetQuotaStatusResponse {
  storage: {
    current: string;
    limit: string;
    percentage: number;
  };
  compute: {
    current: number;
    limit: number;
    percentage: number;
  };
  alerts: any[];
}

interface GetQuotaAlertsRequest {
  authorization: Header<'Authorization'>;
}

interface AcknowledgeAlertRequest {
  authorization: Header<'Authorization'>;
  alertId: string;
}

interface GetBillingCycleRequest {
  authorization: Header<'Authorization'>;
}

interface GetBillingCyclesRequest {
  authorization: Header<'Authorization'>;
  limit?: number;
}

/**
 * Get current quota status for user
 */
export const getQuotaStatus = api(
  { method: 'GET', path: '/billing/quota' },
  async (req: GetQuotaStatusRequest): Promise<GetQuotaStatusResponse> => {
    const { userId } = await verifyClerkJWT(req.authorization);

    // Get subscription tier
    const tier = await getUserSubscriptionTier(userId);

    // Check storage quota
    const storageCheck = await usageTracker.checkQuota(
      userId,
      tier,
      'storage',
      BigInt(0) // Just checking current usage
    );

    // Check compute quota
    const computeCheck = await usageTracker.checkQuota(
      userId,
      tier,
      'compute',
      BigInt(0)
    );

    // Get alerts
    const alerts = await usageTracker.getQuotaAlerts(userId);

    return {
      storage: {
        current: storageCheck.currentUsage.toString(),
        limit: storageCheck.limit.toString(),
        percentage: Number((storageCheck.currentUsage * BigInt(100)) / storageCheck.limit),
      },
      compute: {
        current: Number(computeCheck.currentUsage),
        limit: Number(computeCheck.limit),
        percentage: Number((computeCheck.currentUsage * BigInt(100)) / computeCheck.limit),
      },
      alerts,
    };
  }
);

/**
 * Get quota alerts for user
 */
export const getQuotaAlerts = api(
  { method: 'GET', path: '/billing/alerts' },
  async (req: GetQuotaAlertsRequest): Promise<{ alerts: any[] }> => {
    const { userId } = await verifyClerkJWT(req.authorization);

    const alerts = await usageTracker.getQuotaAlerts(userId);

    return { alerts };
  }
);

/**
 * Acknowledge a quota alert
 */
export const acknowledgeAlert = api(
  { method: 'POST', path: '/billing/alerts/:alertId/acknowledge' },
  async (req: AcknowledgeAlertRequest): Promise<{ success: boolean }> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const alertId = BigInt(req.alertId);

    await usageTracker.acknowledgeAlert(alertId);

    return { success: true };
  }
);

/**
 * Get current billing cycle
 */
export const getCurrentBillingCycle = api(
  { method: 'GET', path: '/billing/cycle/current' },
  async (req: GetBillingCycleRequest): Promise<{ cycle: any }> => {
    const { userId } = await verifyClerkJWT(req.authorization);

    const tier = await getUserSubscriptionTier(userId);

    const cycle = await usageTracker.updateBillingCycle(userId, tier);

    return { cycle };
  }
);

/**
 * Get billing cycle history
 */
export const getBillingCycles = api(
  { method: 'GET', path: '/billing/cycles' },
  async (req: GetBillingCyclesRequest): Promise<{ cycles: any[] }> => {
    const { userId } = await verifyClerkJWT(req.authorization);

    const cycles = await usageTracker.getBillingCycles(userId, req.limit || 12);

    return { cycles };
  }
);

/**
 * Get detailed usage breakdown
 */
export const getUsageBreakdown = api(
  { method: 'GET', path: '/billing/usage' },
  async ({
    authorization,
  }: {
    authorization: Header<'Authorization'>;
  }): Promise<{
    storage: { total: string; byProject: Array<{ projectId: string; name: string; bytes: string }> };
    compute: { total: number; byProject: Array<{ projectId: string; name: string; minutes: number }> };
  }> => {
    const { userId } = await verifyClerkJWT(authorization);

    // This would require additional queries to break down by project
    // For now, return placeholder structure

    return {
      storage: {
        total: '0',
        byProject: [],
      },
      compute: {
        total: 0,
        byProject: [],
      },
    };
  }
);
