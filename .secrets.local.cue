// Encore Local Development Secrets
// This file stores secret values for local development only.
// See: https://encore.dev/docs/primitives/secrets
//
// IMPORTANT: 
// - This file is for local development on your machine only
// - DO NOT commit this file to version control (should be in .gitignore)
// - For production, use Encore Cloud dashboard or `encore secret set`
// - Secrets defined here override any values from Encore Cloud
//
// REMOTE DEVELOPMENT SETUP:
// These secrets are configured for remote server development where the
// backend is accessed from a different machine over the network.

// Daytona API Configuration (required)
DaytonaAPIKey: "dtn_cdfc730d2ff8c56a055f8340ad7407db91f0ba080bf852ee474e4f17d5f633d5"
DaytonaAPIURL: "https://app.daytona.io/api"

// Clerk Authentication (required)
ClerkPublishableKey: "pk_test_bGlrZWQtY2F0LTg0LmNsZXJrLmFjY291bnRzLmRldiQ"
ClerkSecretKey: "sk_test_lzLEtL1ZhM191HtwvDAgT4lMvLUYxiMtvkRp2XrS2a"
ClerkWebhookSecret: "whsec_local_development_placeholder"

// User Data Encryption (required for storing user secrets)
UserSecretEncryptionKey: "local_dev_encryption_key_32bytes_minimum_length_required"

// Mem0 Memory API (optional - for persistent agent memory)
Mem0APIKey: "m0-mP3vIRX3uETM6CpXdTquDbHHbsowZ2OsDclgPXc2"


