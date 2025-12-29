import { api } from 'encore.dev/api';
import { db } from './db.js';

/**
 * DEVELOPMENT ONLY: Clear encrypted user secrets
 * Used when encryption key changes in development
 */
export const clearUserSecrets = api(
    { expose: false, method: 'POST', path: '/users/dev/clear-secrets' },
    async (): Promise<{ cleared: number }> => {
        const result = await db.exec`TRUNCATE user_secrets`;
        console.log('[DEV] Cleared user_secrets table');
        return { cleared: 0 }; // rowCount not available for TRUNCATE
    }
);
