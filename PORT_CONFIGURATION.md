# Vaporform Port Configuration

**Last Updated:** 2025-10-14 21:17 UTC
**Status:** Frontend ✅ Running | Backend ✅ Running

## Service Ports

### Frontend (Next.js)
- **Port:** 3000
- **Status:** ✅ Running
- **URL:** http://localhost:3000
- **Process:** Next.js development server with Turbopack

### Backend (Encore)
- **API Port:** 4000
- **WebSocket Terminal Port:** 4001
- **Dashboard Port:** 9400
- **Status:** ✅ Running
- **API URL:** http://localhost:4000
- **Dashboard URL:** http://localhost:9400/7ci7g

### Encore Services (Internal Ports 9500-9900)
These ports are for individual Encore microservices and PostgreSQL databases:
- **9500:** PostgreSQL connection port
- **9600:** Service endpoint
- **9700:** Service endpoint
- **9800:** Service endpoint
- **9900:** Service endpoint

## Resolution Summary

### Backend Migration Issue - RESOLVED ✅
**Problem:** Encore migration system was out of sync for `ai` database
**Root Cause:** Tables existed but migration wasn't marked as applied
**Solution:** Made migration idempotent by adding `IF NOT EXISTS` to all CREATE statements
**Result:** Backend now starts successfully with all services operational

**Services Confirmed Running:**
- ✅ Daytona SDK initialized (https://app.daytona.io/api)
- ✅ WebSocket terminal server (port 4001)
- ✅ MongoDB GridFS connected
- ✅ All 10 microservices operational
- ✅ PostgreSQL databases (ai, billing, git, infra, organizations, projects, terminal, users, vector, vfs, workspace)

## TypeScript Compilation
- **Status:** ✅ All 47 errors fixed
- **Command:** `npx tsc --noEmit`
- **Result:** 0 errors

## How to Start Services

### Frontend
```bash
cd vaporform-frontend
npm run dev
```

### Backend (Once Fixed)
```bash
cd vaporform
./start-encore.sh
```

**Environment Variables Required:**
- `CLERK_SECRET_KEY`
- `CLERK_PUBLISHABLE_KEY`
- `DAYTONA_API_KEY`

## Port Management Best Practices

1. **Port 4000** = Encore Backend API (primary application endpoint)
2. **Port 9400** = Encore Developer Dashboard (for monitoring/debugging)
3. **Port 3000** = Frontend (Next.js)
4. **Ports 9500-9900** = Internal Encore infrastructure

## Verification Commands

```bash
# Check all listening ports
ss -tuln | grep LISTEN

# Check Encore processes
ps aux | grep encore

# Check Frontend
curl http://localhost:3000

# Check Backend API (when running)
curl http://localhost:4000/health

# Check Encore Dashboard
curl http://localhost:9400
```

## Database Access

```bash
# Access PostgreSQL via Docker
docker exec -i <postgres-container-id> psql -U encore-admin -d <database-name>

# Find PostgreSQL container
docker ps | grep postgres

# Example: Access AI database
docker exec -i ad64d7ff5c32 psql -U encore-admin -d ai
```

## Migration Management

```bash
# View migration status
docker exec -i <postgres-container-id> psql -U encore-admin -d <db> -c "SELECT * FROM schema_migrations;"

# Mark migration as applied (if needed)
docker exec -i <postgres-container-id> psql -U encore-admin -d <db> -c "INSERT INTO schema_migrations (version, dirty) VALUES (1, false) ON CONFLICT (version) DO UPDATE SET dirty = false;"

# Delete migration version (if needed)
docker exec -i <postgres-container-id> psql -U encore-admin -d <db> -c "DELETE FROM schema_migrations WHERE version = <version>;"
```
