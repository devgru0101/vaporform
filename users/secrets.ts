/**
 * User Secrets Helper Functions
 * Provides utilities for retrieving user API keys and secrets
 */

import { db } from './db.js';

/**
 * Get a user's API key for a specific service
 */
export async function getUserApiKey(userId: string, service: 'anthropic' | 'openai'): Promise<string | null> {
  const secretKey = service === 'anthropic' ? 'anthropic_api_key' : 'openai_api_key';

  const result = await db.queryRow<{ secret_value: string }>`
    SELECT secret_value
    FROM user_secrets
    WHERE user_id = ${userId} AND secret_key = ${secretKey}
  `;

  if (!result) {
    return null;
  }

  return result.secret_value;
}

/**
 * Get user's Anthropic API key (for Claude)
 */
export async function getUserAnthropicKey(userId: string): Promise<string | null> {
  return getUserApiKey(userId, 'anthropic');
}

/**
 * Get user's OpenAI API key
 */
export async function getUserOpenAIKey(userId: string): Promise<string | null> {
  return getUserApiKey(userId, 'openai');
}

/**
 * Set a user's API key for a specific service
 */
export async function setUserApiKey(
  userId: string,
  service: 'anthropic' | 'openai',
  apiKey: string
): Promise<void> {
  const secretKey = service === 'anthropic' ? 'anthropic_api_key' : 'openai_api_key';

  await db.exec`
    INSERT INTO user_secrets (user_id, secret_key, secret_value, updated_at)
    VALUES (${userId}, ${secretKey}, ${apiKey}, NOW())
    ON CONFLICT (user_id, secret_key)
    DO UPDATE SET secret_value = ${apiKey}, updated_at = NOW()
  `;
}

/**
 * Delete a user's API key
 */
export async function deleteUserApiKey(userId: string, service: 'anthropic' | 'openai'): Promise<void> {
  const secretKey = service === 'anthropic' ? 'anthropic_api_key' : 'openai_api_key';

  await db.exec`
    DELETE FROM user_secrets
    WHERE user_id = ${userId} AND secret_key = ${secretKey}
  `;
}
