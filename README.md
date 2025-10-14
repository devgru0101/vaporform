# Vaporform

Cloud-based agentic development environment with AI-powered code generation, virtual file system, and real-time collaboration.

## Features

- 🤖 **AI-Powered Code Generation**: KiloCode integration with GPT-4 and RAG (Qdrant)
- 📁 **Virtual File System**: MongoDB GridFS - complete isolation per project
- 🔐 **Multi-tenant Auth**: Clerk with organization support and RBAC
- 🖥️ **Cloud IDE**: Monaco Editor with integrated terminal (xterm.js)
- 🔄 **Git Integration**: Version control with visual rollback
- 🚀 **Docker Deployments**: Dynamic subdomains with Traefik routing
- 💳 **Usage Tracking**: Tiered subscriptions (Free, Pro, Team, Enterprise)
- 🎨 **Brutalist UI**: Black/white with neon green (#00FF41) and blue (#00D9FF)

## Quick Start

### 1. Fix Docker Permissions (One-time setup)

```bash
sudo usermod -aG docker $USER
newgrp docker
```

### 2. Start Infrastructure

```bash
cd /home/ssitzer/projects/vaporform
./quick-start.sh
```

This starts:
- PostgreSQL (metadata storage)
- MongoDB (GridFS file storage)
- Qdrant (vector embeddings)
- Redis (cache/sessions)

### 3. Configure Environment

Edit `.env` and add your API keys:

```bash
# Required
OPENAI_API_KEY=sk-proj-...
CLERK_SECRET_KEY=sk_test_...
CLERK_WEBHOOK_SECRET=whsec_...

# Optional
DAYTONA_API_KEY=...
```

### 4. Start Backend

```bash
encore run
```

Access at: http://127.0.0.1:4000
Dashboard: http://127.0.0.1:9400

### 5. Start Frontend

```bash
cd ../vaporform-frontend
npm run dev
```

Access at: http://localhost:3000

## Architecture

```
┌─────────────────────────────────────────────────┐
│              Next.js Frontend                    │
│  Monaco Editor + File Tree + AI Chat + Terminal │
└────────────────┬────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────┐
│           Encore Backend (10 Services)          │
│  Users │ Orgs │ Projects │ VFS │ Git │ Vector  │
│  AI │ Workspace │ Infra │ Billing │ Terminal   │
└────────┬───────┬───────┬───────┬────────────────┘
         │       │       │       │
    ┌────▼──┐ ┌─▼───┐ ┌─▼────┐ ┌▼────┐
    │Postgres│ │Mongo│ │Qdrant│ │Redis│
    └────────┘ └─────┘ └──────┘ └─────┘
```

## Services

| Service | Description | Port | API Endpoints |
|---------|-------------|------|---------------|
| Users | User management & Clerk webhooks | 4000 | 6 |
| Organizations | Multi-tenant org management | 4000 | 8 |
| Projects | Project CRUD with RBAC | 4000 | 10 |
| VFS | GridFS virtual file system | 4000 | 11 |
| Git | Version control operations | 4000 | 8 |
| Vector | Qdrant embeddings & RAG | 4000 | 6 |
| AI | KiloCode chat with streaming | 4000 | 8 |
| Workspace | Daytona build integration | 4000 | 7 |
| Infra | Docker deployments | 4000 | 9 |
| Billing | Usage tracking & quotas | 4000 | 8 |
| Terminal | WebSocket PTY sessions | 4001 | 6 |

**Total**: 81 API endpoints, 21 database tables

## Documentation

- [INFRASTRUCTURE_SETUP.md](INFRASTRUCTURE_SETUP.md) - Local development setup
- [DEPLOYMENT.md](DEPLOYMENT.md) - Production deployment guide
- [PRODUCTION_INFRASTRUCTURE.md](PRODUCTION_INFRASTRUCTURE.md) - Infrastructure overview
- [REQUIREMENTS_VERIFICATION.md](REQUIREMENTS_VERIFICATION.md) - Feature checklist
- [DEVELOPMENT.md](DEVELOPMENT.md) - Development guide

## Development

```bash
# Start infrastructure
./quick-start.sh

# Run backend
encore run

# Run frontend (separate terminal)
cd ../vaporform-frontend && npm run dev

# View logs
docker compose logs -f

# Stop infrastructure
docker compose down
```

## Testing

```bash
encore test
```

## Production Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for complete production setup with:
- Traefik reverse proxy
- Let's Encrypt SSL/TLS
- Docker orchestration
- Automated backups
- Health monitoring

## Tech Stack

**Backend**: Encore.ts, PostgreSQL, MongoDB, Qdrant, Redis, OpenAI, Clerk, Dockerode

**Frontend**: Next.js 15, Monaco Editor, xterm.js, Tailwind CSS, React Query

**Infrastructure**: Docker, Traefik, Let's Encrypt

## License

MIT
