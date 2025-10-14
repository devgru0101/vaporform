# 🚀 START VAPORFORM - Quick Guide

## Current Status

✅ **Infrastructure Ready**: MongoDB, Qdrant, Redis running
✅ **Code Fixed**: All compilation errors resolved
✅ **PostgreSQL Removed**: Encore will create its own
⚠️  **Docker Permissions**: Need to refresh your shell session

---

## The Problem

Even though your user `ssitzer` is in the docker group, your **current shell session** doesn't have the permission loaded. The `sg docker -c` wrapper doesn't work for Encore because it spawns child processes.

---

## The Solution (REQUIRED)

You **MUST** do ONE of these to refresh Docker permissions:

### Option 1: Start Fresh Terminal (EASIEST)

1. Open a **brand new** terminal window/tab
2. Verify Docker access:
   ```bash
   docker ps
   ```
   Should work WITHOUT `sudo` or `sg docker`

3. Start Vaporform:
   ```bash
   cd /home/ssitzer/projects/vaporform
   encore run
   ```

### Option 2: Use `newgrp docker`

In your current terminal:

```bash
newgrp docker
```

This starts a new shell with docker group. Then:

```bash
cd /home/ssitzer/projects/vaporform
encore run
```

### Option 3: Log Out and Back In

This is the most reliable but requires closing everything:

```bash
exit
# Log back in
docker ps  # verify
cd /home/ssitzer/projects/vaporform
encore run
```

---

## After Fixing Permissions

Run this:

```bash
cd /home/ssitzer/projects/vaporform
encore run
```

### Expected Output

```
  ✔ Building Encore application graph... Done!
  ✔ Analyzing service topology... Done!
  ✔ Creating PostgreSQL database cluster... Done!
  ✔ Running database migrations... Done!
  ✔ Compiling application source... Done!
  ✔ Starting Encore application... Done!

Encore development server running!

Your API is running at:     http://127.0.0.1:4000
Development Dashboard URL:  http://127.0.0.1:9400
MCP SSE URL:               http://127.0.0.1:9900/sse?appID=xxxxx
```

---

## What Encore Will Do

When you run `encore run`, it will:

1. ✅ Build and validate all 10 microservices
2. ✅ Create its own PostgreSQL container (separate from infrastructure)
3. ✅ Run all database migrations
4. ✅ Start the API server on port 4000
5. ✅ Open the dashboard on port 9400

---

## Verify Everything Works

After Encore starts, check these URLs:

1. **API Health** - http://127.0.0.1:4000
2. **Dashboard** - http://127.0.0.1:9400
3. **MongoDB** - Already running (port 27017)
4. **Qdrant** - Already running (port 6333)
5. **Redis** - Already running (port 6379)

---

## Start Frontend (Optional)

In a **separate terminal**:

```bash
cd /home/ssitzer/projects/vaporform-frontend
npm run dev
```

Access at: http://localhost:3000

---

## Troubleshooting

### "The docker daemon is not running"

This means Docker permissions still aren't loaded. You MUST use one of the 3 options above. The `sg docker -c` wrapper does NOT work for Encore.

### "Port 5432 already in use"

PostgreSQL container still running. Remove it:
```bash
docker stop vaporform-dev-postgres
docker rm vaporform-dev-postgres
```

### Encore creates multiple PostgreSQL containers

This is normal! Encore manages its own PostgreSQL separate from your infrastructure services.

---

## Quick Commands

```bash
# Fix permissions (choose ONE):
newgrp docker                    # New shell with docker group
# OR open new terminal
# OR log out/in

# Verify Docker
docker ps                        # Should work without sudo

# Start infrastructure (already running)
docker compose ps                # Check status

# Start Encore backend
cd /home/ssitzer/projects/vaporform
encore run

# Start frontend (separate terminal)
cd /home/ssitzer/projects/vaporform-frontend
npm run dev
```

---

## Summary

1. ✅ Infrastructure is running (MongoDB, Qdrant, Redis)
2. ✅ PostgreSQL removed (Encore will handle it)
3. ✅ Code is fixed and ready
4. ⚠️  **YOU NEED TO**: Refresh Docker permissions
5. 🚀 **THEN RUN**: `encore run`

**Choose Option 1 (new terminal) - it's the easiest!**
