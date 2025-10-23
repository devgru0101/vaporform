#!/bin/bash
set -e

echo "=== CLEAN RESTART SCRIPT ==="

# Kill all Encore processes
echo "Killing all Encore processes..."
pkill -9 -f "encore daemon" 2>/dev/null || true
pkill -9 -f "encore run" 2>/dev/null || true
fuser -k 4000/tcp 2>/dev/null || true
fuser -k 4001/tcp 2>/dev/null || true
fuser -k 4003/tcp 2>/dev/null || true
sleep 3

# Clean Encore build cache
echo "Cleaning Encore build cache..."
rm -rf .encore/build 2>/dev/null || true

# Start Encore
echo "Starting Encore backend..."
nohup encore run --listen=0.0.0.0:4000 > /tmp/encore.log 2>&1 &
ENCORE_PID=$!
echo "Backend started in background (PID: $ENCORE_PID)"
echo "Logs: tail -f /tmp/encore.log"

echo "=== RESTART COMPLETE ==="
