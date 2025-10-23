#!/usr/bin/env bash
set -e

echo "=== ROBUST BACKEND START SCRIPT ==="

# Step 1: Kill existing processes
echo "Killing existing Encore processes..."
pkill -9 -f "encore run" 2>/dev/null || true
pkill -9 -f "restart-clean" 2>/dev/null || true
sleep 2

# Step 2: Wait for port to be free
echo "Waiting for port 4000 to be free..."
for i in {1..10}; do
  if ! lsof -i :4000 >/dev/null 2>&1; then
    echo "Port 4000 is free"
    break
  fi
  echo "Port 4000 still in use, waiting..."
  sleep 1
done

# Step 3: Start Encore with nohup
echo "Starting Encore backend..."
cd /home/scott-sitzer/Projects/vaporform
nohup encore run --listen=0.0.0.0:4000 > /tmp/encore.log 2>&1 &
ENCORE_PID=$!
echo "✓ Backend started (PID: $ENCORE_PID)"

# Step 4: Wait for backend to be ready
echo "Waiting for backend to be ready..."
for i in {1..30}; do
  if curl -s http://127.0.0.1:4000 >/dev/null 2>&1; then
    echo "✓ Backend is responding!"
    break
  fi
  if [ $i -eq 30 ]; then
    echo "✗ Backend failed to start within 30 seconds"
    echo "Last 20 lines of log:"
    tail -20 /tmp/encore.log
    exit 1
  fi
  sleep 1
  echo -n "."
done

# Step 5: Verify it's running
echo ""
echo "=== BACKEND STATUS ==="
echo "Process: $(ps aux | grep 'encore run' | grep -v grep | head -1)"
echo "Port 4000: $(lsof -i :4000 | grep LISTEN || echo 'NOT LISTENING')"
echo ""
echo "✅ Backend is running successfully!"
echo "   API: http://0.0.0.0:4000"
echo "   Logs: tail -f /tmp/encore.log"
echo ""
echo "Last 10 lines of log:"
tail -10 /tmp/encore.log
