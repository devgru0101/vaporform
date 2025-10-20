/**
 * User Secrets Helper Functions
 * Provides utilities for retrieving user API keys and secrets
 *
 * User-provided API keys are encrypted at rest using PostgreSQL's pgcrypto extension.
 * Encryption key is managed via Encore secrets (UserSecretEncryptionKey).
 *
 * Security Features:
 * - AES-256 symmetric encryption via pgp_sym_encrypt()
 * - Encryption key stored securely in Encore secrets
 * - Automatic migration from plain text to encrypted storage
 */

import { secret } from 'encore.dev/config';
import { db } from './db.js';

// Define encryption key secret
// Note: Secret names are globally unique - same secret value across all services
const userSecretEncryptionKey = secret("UserSecretEncryptionKey");

/**
 * Get a user's API key for a specific service
 * Handles both encrypted (new) and plain text (legacy) storage
 * Automatically migrates plain text to encrypted on first access
 */
export async function getUserApiKey(userId: string, service: 'anthropic' | 'openai'): Promise<string | null> {
  const secretKey = service === 'anthropic' ? 'anthropic_api_key' : 'openai_api_key';
  const encryptionKey = userSecretEncryptionKey();

  // Check which type of storage is being used
  const result = await db.queryRow<{
    secret_value: string | null;
    has_encrypted: boolean;
  }>`
    SELECT
      secret_value,
      (secret_value_encrypted IS NOT NULL) as has_encrypted
    FROM user_secrets
    WHERE user_id = ${userId} AND secret_key = ${secretKey}
  `;

  if (!result) {
    return null;
  }

  // If encrypted version exists, decrypt it directly in the query
  if (result.has_encrypted) {
    const decrypted = await db.queryRow<{ decrypted: string }>`
      SELECT pgp_sym_decrypt(secret_value_encrypted, ${encryptionKey}) AS decrypted
      FROM user_secrets
      WHERE user_id = ${userId} AND secret_key = ${secretKey}
    `;
    return decrypted?.decrypted || null;
  }

  // Legacy: plain text exists but not encrypted yet
  // Migrate to encrypted storage
  if (result.secret_value) {
    const plainTextValue = result.secret_value;

    // Encrypt and update
    await db.exec`
      UPDATE user_secrets
      SET secret_value_encrypted = pgp_sym_encrypt(${plainTextValue}, ${encryptionKey}),
          updated_at = NOW()
      WHERE user_id = ${userId} AND secret_key = ${secretKey}
    `;

    console.log(`Migrated user secret ${secretKey} for user ${userId} to encrypted storage`);

    return plainTextValue;
  }

  return null;
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
 * Stores encrypted version only (no plain text)
 */
export async function setUserApiKey(
  userId: string,
  service: 'anthropic' | 'openai',
  apiKey: string
): Promise<void> {
  const secretKey = service === 'anthropic' ? 'anthropic_api_key' : 'openai_api_key';
  const encryptionKey = userSecretEncryptionKey();

  // Insert or update with encrypted value
  await db.exec`
    INSERT INTO user_secrets (user_id, secret_key, secret_value_encrypted, updated_at)
    VALUES (
      ${userId},
      ${secretKey},
      pgp_sym_encrypt(${apiKey}, ${encryptionKey}),
      NOW()
    )
    ON CONFLICT (user_id, secret_key)
    DO UPDATE SET
      secret_value_encrypted = pgp_sym_encrypt(${apiKey}, ${encryptionKey}),
      secret_value = NULL,
      updated_at = NOW()
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
