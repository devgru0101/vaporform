#!/bin/bash
set -e

echo "=== KILLING ALL ENCORE PROCESSES ==="

# Kill daemon
echo "Killing Encore daemon..."
pkill -9 -f "encore daemon" 2>/dev/null || true

# Kill all encore run processes
echo "Killing all encore run processes..."
pkill -9 -f "encore run" 2>/dev/null || true

# Kill all node processes running vaporform builds
echo "Killing all Vaporform node processes..."
pkill -9 -f "vaporform.*main.mjs" 2>/dev/null || true

# Kill processes on ports
echo "Killing processes on ports 4000, 4001, 4003..."
fuser -k 4000/tcp 2>/dev/null || true
fuser -k 4001/tcp 2>/dev/null || true
fuser -k 4003/tcp 2>/dev/null || true

sleep 3

echo "=== ALL ENCORE PROCESSES KILLED ==="

# Verify nothing is running
echo "Verifying cleanup..."
ps aux | grep -E "encore|vaporform.*main.mjs" | grep -v grep || echo "✓ No Encore processes found"

echo ""
echo "Now run: encore run"
