#!/bin/bash
# Startup script for Encore backend
# Workaround: Encore parses ALL TypeScript files in the directory tree,
# including the Next.js frontend which uses path aliases (@/...) that Encore can't resolve.
# This script temporarily moves frontend during Encore startup.

set -e

cd "$(dirname "$0")"

echo "🚀 Starting Vaporform Encore Backend..."

# Check if frontend needs to be moved
if [ -d "frontend" ] && [ ! -d "../vaporform-frontend-running" ]; then
  echo "📦 Temporarily moving frontend directory..."
  mv frontend ../vaporform-frontend-running
  MOVED_FRONTEND=true
else
  MOVED_FRONTEND=false
fi

# Trap to ensure frontend is moved back on exit
cleanup() {
  if [ "$MOVED_FRONTEND" = "true" ] && [ -d "../vaporform-frontend-running" ]; then
    echo "📦 Moving frontend back..."
    mv ../vaporform-frontend-running frontend
  fi
}
trap cleanup EXIT INT TERM

# Start Encore
echo "✓ Starting Encore..."
encore run --listen=0.0.0.0:4000

# Note: frontend will be moved back by cleanup trap when Encore exits
