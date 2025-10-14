#!/bin/bash
# Startup script for Encore with environment variables

cd "$(dirname "$0")"

# Export Clerk environment variables explicitly
export CLERK_SECRET_KEY="sk_test_lzLEtL1ZhM191HtwvDAgT4lMvLUYxiMtvkRp2XrS2a"
export CLERK_PUBLISHABLE_KEY="pk_test_bGlrZWQtY2F0LTg0LmNsZXJrLmFjY291bnRzLmRldiQ"

# Source the rest of the .env file for other variables
set -a
source .env 2>/dev/null || true
set +a

# Start Encore
encore run
