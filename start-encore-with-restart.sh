#!/bin/bash

# Vaporform Backend Auto-Restart Script
# This script monitors the Encore backend and automatically restarts it if it crashes

# Configuration
MAX_RETRIES=999999  # Effectively unlimited retries
RETRY_DELAY=5       # Seconds to wait before restarting after a crash
LOG_FILE="/home/ssitzer/projects/vaporform/encore-restart.log"

# Environment variables
export DAYTONA_API_KEY=dtn_2529c2d376aa88a5916dd5f5a131584e84f7b5c7aab97bf4d54cc270e4762fac
export CLERK_SECRET_KEY=sk_test_lzLEtL1ZhM191HtwvDAgT4lMvLUYxiMtvkRp2XrS2a
export CLERK_PUBLISHABLE_KEY=pk_test_bGlrZWQtY2F0LTg0LmNsZXJrLmFjY291bnRzLmRldiQ

# Change to project directory
cd /home/ssitzer/projects/vaporform || exit 1

# Initialize log
echo "========================================" >> "$LOG_FILE"
echo "Backend auto-restart started at $(date)" >> "$LOG_FILE"
echo "========================================" >> "$LOG_FILE"

# Retry counter
retry_count=0

# Main restart loop
while [ $retry_count -lt $MAX_RETRIES ]; do
    retry_count=$((retry_count + 1))

    echo "[$(date)] Starting Encore backend (attempt #$retry_count)..." | tee -a "$LOG_FILE"

    # Start encore and capture exit code
    encore run
    exit_code=$?

    # Log the crash
    echo "[$(date)] Backend exited with code $exit_code" | tee -a "$LOG_FILE"

    # Check if it was a clean shutdown (Ctrl+C = exit code 130)
    if [ $exit_code -eq 130 ] || [ $exit_code -eq 143 ]; then
        echo "[$(date)] Clean shutdown detected. Stopping auto-restart." | tee -a "$LOG_FILE"
        exit 0
    fi

    # Log crash and prepare to restart
    echo "[$(date)] Backend crashed! Restarting in $RETRY_DELAY seconds..." | tee -a "$LOG_FILE"

    # Wait before restarting
    sleep $RETRY_DELAY
done

echo "[$(date)] Maximum retry limit reached. Exiting." | tee -a "$LOG_FILE"
exit 1
