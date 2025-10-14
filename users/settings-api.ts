/**
 * User Settings API
 * Manages user preferences and configuration
 */

import { api, Header } from 'encore.dev/api';
import { verifyClerkJWT } from '../shared/clerk-auth.js';
import { ValidationError, toAPIError } from '../shared/errors.js';
import { db } from './db.js';

export interface UserSettings {
  // Theme
  theme: 'dark' | 'light' | 'auto';
  primaryColor: string;
  fontSize: number;
  fontFamily: string;

  // Editor
  editorTheme: string;
  tabSize: number;
  autoSave: boolean;
  formatOnSave: boolean;
  minimap: boolean;
  lineNumbers: boolean;
  wordWrap: boolean;

  // AI
  aiModel: string;
  aiTemperature: number;
  aiMaxTokens: number;
  aiAutoComplete: boolean;
  aiProvider?: string;
  aiApiKey?: string; // API key for AI model (stored separately in user_secrets)
  aiBaseUrl?: string;
  aiCustomModelId?: string;
  aiContextWindow?: number;
  aiEnablePromptCaching?: boolean;
  aiEnableStreaming?: boolean;
  aiAutoApproveEdits?: boolean;
  aiEnableDiffStrategy?: boolean;
  aiConsecutiveErrorLimit?: number;
  aiRateLimit?: number;
  aiMaxRequests?: number;
  aiOAuthToken?: string; // OAuth access token for Claude subscription
  aiOAuthProvider?: string; // OAuth provider (e.g., 'claude')

  // Terminal
  terminalFontSize: number;
  terminalCursorStyle: 'block' | 'line' | 'underline';
  terminalCursorBlink: boolean;

  // Performance
  maxFileSize: number;
  enableCache: boolean;
  preloadFiles: boolean;
}

interface GetSettingsRequest {
  authorization: Header<'Authorization'>;
}

interface GetSettingsResponse {
  settings: UserSettings;
}

interface UpdateSettingsRequest {
  authorization: Header<'Authorization'>;
  settings: Partial<UserSettings>;
}

interface UpdateSettingsResponse {
  settings: UserSettings;
  success: boolean;
}

/**
 * Get user settings
 */
export const getUserSettings = api(
  { method: 'GET', path: '/users/settings' },
  async (req: GetSettingsRequest): Promise<GetSettingsResponse> => {
    const { userId } = await verifyClerkJWT(req.authorization);

    // Get settings from database
    const result: { settings: UserSettings }[] = [];
    for await (const row of db.query<{ settings: UserSettings }>`
      SELECT settings
      FROM user_settings
      WHERE user_id = ${userId}
    `) {
      result.push(row);
    }

    let settings: UserSettings;

    if (result.length === 0) {
      // Return default settings if none exist
      settings = {
        theme: 'dark',
        primaryColor: '#CAC4B7',
        fontSize: 14,
        fontFamily: 'Inter',
        editorTheme: 'vs-dark',
        tabSize: 2,
        autoSave: true,
        formatOnSave: true,
        minimap: true,
        lineNumbers: true,
        wordWrap: false,
        aiModel: 'claude-3-5-sonnet-20241022',
        aiTemperature: 0.7,
        aiMaxTokens: 8192,
        aiAutoComplete: true,
        aiProvider: 'anthropic',
        aiBaseUrl: '',
        aiCustomModelId: '',
        aiContextWindow: 200000,
        aiEnablePromptCaching: true,
        aiEnableStreaming: true,
        aiAutoApproveEdits: false,
        aiEnableDiffStrategy: true,
        aiConsecutiveErrorLimit: 3,
        aiRateLimit: 0,
        aiMaxRequests: 0,
        terminalFontSize: 14,
        terminalCursorStyle: 'block',
        terminalCursorBlink: true,
        maxFileSize: 10,
        enableCache: true,
        preloadFiles: true,
      };
    } else {
      settings = result[0].settings;
    }

    // Fetch API key from user_secrets
    const apiKeyResult: { secret_value: string }[] = [];
    for await (const row of db.query<{ secret_value: string }>`
      SELECT secret_value
      FROM user_secrets
      WHERE user_id = ${userId} AND secret_key = 'anthropic_api_key'
    `) {
      apiKeyResult.push(row);
    }

    if (apiKeyResult.length > 0) {
      settings.aiApiKey = apiKeyResult[0].secret_value;
    }

    // Fetch OAuth token from user_secrets
    const oauthTokenResult: { secret_value: string }[] = [];
    for await (const row of db.query<{ secret_value: string }>`
      SELECT secret_value
      FROM user_secrets
      WHERE user_id = ${userId} AND secret_key = 'claude_oauth_token'
    `) {
      oauthTokenResult.push(row);
    }

    if (oauthTokenResult.length > 0) {
      settings.aiOAuthToken = oauthTokenResult[0].secret_value;
      settings.aiOAuthProvider = 'claude';
    }

    return { settings };
  }
);

/**
 * Update user settings
 */
export const updateUserSettings = api(
  { method: 'PUT', path: '/users/settings' },
  async (req: UpdateSettingsRequest): Promise<UpdateSettingsResponse> => {
    const { userId } = await verifyClerkJWT(req.authorization);

    if (!req.settings || Object.keys(req.settings).length === 0) {
      throw toAPIError(new ValidationError('Settings object is required'));
    }

    // Extract API key and OAuth token if present (store separately in user_secrets)
    const { aiApiKey, aiOAuthToken, ...settingsWithoutSecrets } = req.settings;

    // Handle API key separately in user_secrets table
    if (aiApiKey !== undefined) {
      if (aiApiKey && aiApiKey.trim().length > 0) {
        // Upsert API key into user_secrets
        await db.exec`
          INSERT INTO user_secrets (user_id, secret_key, secret_value, updated_at)
          VALUES (${userId}, 'anthropic_api_key', ${aiApiKey}, NOW())
          ON CONFLICT (user_id, secret_key)
          DO UPDATE SET secret_value = ${aiApiKey}, updated_at = NOW()
        `;
      } else {
        // Delete API key if empty string
        await db.exec`
          DELETE FROM user_secrets
          WHERE user_id = ${userId} AND secret_key = 'anthropic_api_key'
        `;
      }
    }

    // Handle OAuth token separately in user_secrets table
    if (aiOAuthToken !== undefined) {
      if (aiOAuthToken && aiOAuthToken.trim().length > 0) {
        // Upsert OAuth token into user_secrets
        await db.exec`
          INSERT INTO user_secrets (user_id, secret_key, secret_value, updated_at)
          VALUES (${userId}, 'claude_oauth_token', ${aiOAuthToken}, NOW())
          ON CONFLICT (user_id, secret_key)
          DO UPDATE SET secret_value = ${aiOAuthToken}, updated_at = NOW()
        `;
      } else {
        // Delete OAuth token if empty string
        await db.exec`
          DELETE FROM user_secrets
          WHERE user_id = ${userId} AND secret_key = 'claude_oauth_token'
        `;
      }
    }

    // Get current settings
    const currentResult: { settings: UserSettings }[] = [];
    for await (const row of db.query<{ settings: UserSettings }>`
      SELECT settings
      FROM user_settings
      WHERE user_id = ${userId}
    `) {
      currentResult.push(row);
    }

    let mergedSettings: UserSettings;

    if (currentResult.length === 0) {
      // Create new settings record with defaults
      const defaultSettings: UserSettings = {
        theme: 'dark',
        primaryColor: '#CAC4B7',
        fontSize: 14,
        fontFamily: 'Inter',
        editorTheme: 'vs-dark',
        tabSize: 2,
        autoSave: true,
        formatOnSave: true,
        minimap: true,
        lineNumbers: true,
        wordWrap: false,
        aiModel: 'claude-3-5-sonnet-20241022',
        aiTemperature: 0.7,
        aiMaxTokens: 8192,
        aiAutoComplete: true,
        aiProvider: 'anthropic',
        aiBaseUrl: '',
        aiCustomModelId: '',
        aiContextWindow: 200000,
        aiEnablePromptCaching: true,
        aiEnableStreaming: true,
        aiAutoApproveEdits: false,
        aiEnableDiffStrategy: true,
        aiConsecutiveErrorLimit: 3,
        aiRateLimit: 0,
        aiMaxRequests: 0,
        terminalFontSize: 14,
        terminalCursorStyle: 'block',
        terminalCursorBlink: true,
        maxFileSize: 10,
        enableCache: true,
        preloadFiles: true,
      };

      mergedSettings = { ...defaultSettings, ...settingsWithoutSecrets };

      await db.exec`
        INSERT INTO user_settings (user_id, settings, updated_at)
        VALUES (${userId}, ${mergedSettings}, NOW())
      `;
    } else {
      // Update existing settings
      mergedSettings = { ...currentResult[0].settings, ...settingsWithoutSecrets };

      await db.exec`
        UPDATE user_settings
        SET settings = ${mergedSettings}, updated_at = NOW()
        WHERE user_id = ${userId}
      `;
    }

    // Include API key in response (fetch from user_secrets)
    const apiKeyResult: { secret_value: string }[] = [];
    for await (const row of db.query<{ secret_value: string }>`
      SELECT secret_value
      FROM user_secrets
      WHERE user_id = ${userId} AND secret_key = 'anthropic_api_key'
    `) {
      apiKeyResult.push(row);
    }

    if (apiKeyResult.length > 0) {
      mergedSettings.aiApiKey = apiKeyResult[0].secret_value;
    }

    // Include OAuth token in response (fetch from user_secrets)
    const oauthTokenResult: { secret_value: string }[] = [];
    for await (const row of db.query<{ secret_value: string }>`
      SELECT secret_value
      FROM user_secrets
      WHERE user_id = ${userId} AND secret_key = 'claude_oauth_token'
    `) {
      oauthTokenResult.push(row);
    }

    if (oauthTokenResult.length > 0) {
      mergedSettings.aiOAuthToken = oauthTokenResult[0].secret_value;
      mergedSettings.aiOAuthProvider = 'claude';
    }

    return {
      settings: mergedSettings,
      success: true,
    };
  }
);

/**
 * Reset user settings to defaults
 */
export const resetUserSettings = api(
  { method: 'POST', path: '/users/settings/reset' },
  async (req: GetSettingsRequest): Promise<UpdateSettingsResponse> => {
    const { userId } = await verifyClerkJWT(req.authorization);

    const defaultSettings: UserSettings = {
      theme: 'dark',
      primaryColor: '#CAC4B7',
      fontSize: 14,
      fontFamily: 'Inter',
      editorTheme: 'vs-dark',
      tabSize: 2,
      autoSave: true,
      formatOnSave: true,
      minimap: true,
      lineNumbers: true,
      wordWrap: false,
      aiModel: 'claude-3-5-sonnet-20241022',
      aiTemperature: 0.7,
      aiMaxTokens: 8192,
      aiAutoComplete: true,
      aiProvider: 'anthropic',
      aiBaseUrl: '',
      aiCustomModelId: '',
      aiContextWindow: 200000,
      aiEnablePromptCaching: true,
      aiEnableStreaming: true,
      aiAutoApproveEdits: false,
      aiEnableDiffStrategy: true,
      aiConsecutiveErrorLimit: 3,
      aiRateLimit: 0,
      aiMaxRequests: 0,
      terminalFontSize: 14,
      terminalCursorStyle: 'block',
      terminalCursorBlink: true,
      maxFileSize: 10,
      enableCache: true,
      preloadFiles: true,
    };

    // Delete existing settings
    await db.exec`
      DELETE FROM user_settings
      WHERE user_id = ${userId}
    `;

    // Insert default settings
    await db.exec`
      INSERT INTO user_settings (user_id, settings, updated_at)
      VALUES (${userId}, ${defaultSettings}, NOW())
    `;

    return {
      settings: defaultSettings,
      success: true,
    };
  }
);
