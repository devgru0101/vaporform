#!/bin/bash
#
# Setup Local Encore Secrets for Vaporform
# Production-Ready Secret Management Migration
#
# This script helps you set up all required Encore secrets for local development.
# Run this after migrating from process.env to Encore secrets.
#
# Usage: ./scripts/setup-local-secrets.sh

set -e  # Exit on error

echo "=================================================="
echo "  Vaporform Encore Secrets Setup (Local)"
echo "=================================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if encore CLI is installed
if ! command -v encore &> /dev/null; then
    echo -e "${RED}Error: Encore CLI is not installed.${NC}"
    echo "Install with: npm install -g encore"
    exit 1
fi

echo -e "${GREEN}✓ Encore CLI found${NC}"
echo ""

# Function to set a secret
set_secret() {
    local secret_name=$1
    local secret_description=$2
    local is_required=$3
    local example_value=$4

    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "${YELLOW}Setting: ${secret_name}${NC}"
    echo "Description: ${secret_description}"

    if [ "$is_required" = "true" ]; then
        echo -e "${RED}REQUIRED${NC}"
    else
        echo -e "${YELLOW}OPTIONAL${NC}"
    fi

    if [ -n "$example_value" ]; then
        echo "Example: ${example_value}"
    fi
    echo ""

    # Check if secret is already set
    if encore secret list 2>/dev/null | grep -q "^${secret_name} "; then
        echo -e "${YELLOW}⚠  Secret '${secret_name}' is already set.${NC}"
        read -p "Do you want to update it? (y/N): " update_choice
        if [[ ! "$update_choice" =~ ^[Yy]$ ]]; then
            echo -e "${GREEN}✓ Skipping${NC}"
            echo ""
            return
        fi
    fi

    # Read secret value
    read -sp "Enter value for ${secret_name}: " secret_value
    echo ""

    if [ -z "$secret_value" ]; then
        if [ "$is_required" = "true" ]; then
            echo -e "${RED}✗ Error: Required secret cannot be empty${NC}"
            return 1
        else
            echo -e "${YELLOW}⚠  Skipping optional secret${NC}"
            echo ""
            return 0
        fi
    fi

    # Set the secret
    echo "$secret_value" | encore secret set --type local "$secret_name" 2>/dev/null

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Secret '${secret_name}' set successfully${NC}"
    else
        echo -e "${RED}✗ Failed to set secret '${secret_name}'${NC}"
        return 1
    fi

    echo ""
}

echo "This script will set up all required Encore secrets for local development."
echo "You can skip optional secrets by pressing Enter without typing a value."
echo ""
read -p "Press Enter to continue..."
echo ""

# ============================================================================
# REQUIRED SECRETS
# ============================================================================

echo "=========================================="
echo "  REQUIRED SECRETS"
echo "=========================================="
echo ""

# Clerk Authentication
set_secret "ClerkSecretKey" \
    "Clerk backend authentication secret key" \
    "true" \
    "sk_test_..."

set_secret "ClerkPublishableKey" \
    "Clerk frontend publishable key" \
    "true" \
    "pk_test_..."

set_secret "ClerkWebhookSecret" \
    "Clerk webhook verification secret" \
    "true" \
    "whsec_..."

# Anthropic AI
set_secret "AnthropicAPIKey" \
    "Anthropic Claude API key (system-wide fallback)" \
    "true" \
    "sk-ant-..."

# OpenAI (for embeddings)
set_secret "OpenAIAPIKey" \
    "OpenAI API key for vector embeddings" \
    "true" \
    "sk-proj-... or sk-..."

# MongoDB
set_secret "MongoDBURI" \
    "MongoDB connection string for GridFS file storage" \
    "true" \
    "mongodb://vaporform:vaporform_dev_password@localhost:27017/vaporform?authSource=admin"

# Qdrant
set_secret "QdrantURL" \
    "Qdrant vector database URL" \
    "true" \
    "http://localhost:6333"

# Encryption Key for User Secrets
echo ""
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}CRITICAL: User Secret Encryption Key${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo "This key encrypts user API keys stored in PostgreSQL."
echo "Once set, this key MUST NEVER CHANGE or existing encrypted data will be lost!"
echo ""
echo "Generate a secure key with: openssl rand -base64 32"
echo ""

set_secret "UserSecretEncryptionKey" \
    "Encryption key for user API keys in PostgreSQL (min 32 chars)" \
    "true" \
    "<run: openssl rand -base64 32>"

# ============================================================================
# OPTIONAL SECRETS
# ============================================================================

echo ""
echo "=========================================="
echo "  OPTIONAL SECRETS"
echo "=========================================="
echo ""

# Qdrant API Key (optional)
set_secret "QdrantAPIKey" \
    "Qdrant API authentication key (only if auth enabled)" \
    "false" \
    ""

# Daytona
set_secret "DaytonaAPIKey" \
    "Daytona workspace management API key" \
    "false" \
    "dtn_..."

set_secret "DaytonaAPIURL" \
    "Daytona API endpoint URL" \
    "false" \
    "https://app.daytona.io/api"

# ============================================================================
# VERIFICATION
# ============================================================================

echo ""
echo "=========================================="
echo "  VERIFICATION"
echo "=========================================="
echo ""

echo "Listing all configured secrets:"
echo ""
encore secret list 2>/dev/null || echo -e "${YELLOW}No secrets configured yet${NC}"

echo ""
echo "=================================================="
echo -e "${GREEN}  ✓ Secret setup complete!${NC}"
echo "=================================================="
echo ""
echo "Next steps:"
echo "1. Start your infrastructure: ./quick-start.sh"
echo "2. Run Encore: encore run"
echo "3. Access dashboard: http://127.0.0.1:9400"
echo ""
echo "For production deployment:"
echo "  encore secret set --type prod <SecretName>"
echo ""
echo "See CLAUDE.md for complete documentation."
echo ""
