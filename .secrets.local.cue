// Local secret overrides for Encore development
// This file is git-ignored and should never be committed
//
// IMPORTANT: These secrets are for LOCAL DEVELOPMENT ONLY
// For production, use: encore secret set --type prod SecretName

// ============================================================================
// Authentication - Clerk
// ============================================================================
ClerkSecretKey: "sk_test_lzLEtL1ZhM191HtwvDAgT4lMvLUYxiMtvkRp2XrS2a"
ClerkPublishableKey: "pk_test_bGlrZWQtY2F0LTg0LmNsZXJrLmFjY291bnRzLmRldiQ"
ClerkWebhookSecret: "whsec_your_webhook_secret_here"

// ============================================================================
// AI Services
// ============================================================================
// Claude API for agentic code generation
AnthropicAPIKey: "sk-ant-api03-9lDUD86dAT43lRd3ixhN-81lteQJoUbOI0jz6hAP_PlK6JxQDjEeqkYsYUX2Nb8nkR-EhSuIm0Cy-XkCjkiQ4Q-ZiZlGwAA"

// OpenAI for embeddings only (RAG/vector search)
OpenAIAPIKey: "sk_your_openai_key_here"

// ============================================================================
// Databases
// ============================================================================
// MongoDB GridFS for file storage
MongoDBURI: "mongodb://vaporform:vaporform_dev_password@localhost:27017/vaporform?authSource=admin"

// Qdrant vector database for RAG
QdrantURL: "http://localhost:6333"
QdrantAPIKey: ""  // Optional - leave empty if not using authentication

// Redis (managed by docker-compose)
RedisURL: "redis://localhost:6379"

// ============================================================================
// User Secret Encryption
// ============================================================================
// CRITICAL: This key encrypts user API keys in the database
// NEVER change this after encrypting data or all encrypted data will be lost!
UserSecretEncryptionKey: "CYO3vAGETVg3hcnHLIV4tpcvHRr9a7OORh8u9eakt1Q="

// ============================================================================
// Optional Services
// ============================================================================
// Daytona workspace management (optional feature)
DaytonaAPIKey: "dtn_c64c949a93b3537a57913ea367b075fce8ad72f1ef2a7c1e2c8591823201bd85"
DaytonaAPIURL: "https://app.daytona.io/api"
