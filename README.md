# Vaporform

Cloud-based agentic development environment with AI-powered code generation, virtual file system, and real-time collaboration.

## Features

- 🤖 **AI-Powered Code Generation**: Claude agentic system with tool use + OpenAI embeddings for RAG
- 📁 **Virtual File System**: MongoDB GridFS - complete isolation per project
- 🔐 **Multi-tenant Auth**: Clerk with organization support and RBAC
- 🔒 **Secure Secret Management**: Encore secrets with encrypted user API keys (pgcrypto AES-256)
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
- MongoDB (GridFS file storage)
- Qdrant (vector embeddings)
- Redis (cache/sessions)

Note: PostgreSQL is managed by Encore automatically.

### 3. Configure Secrets

**All secrets are managed via Encore** (no `.env` required).

Run the interactive setup script:

```bash
./scripts/setup-local-secrets.sh
```

Or manually set secrets:

```bash
# Required secrets
encore secret set --type local ClerkSecretKey
encore secret set --type local ClerkPublishableKey
encore secret set --type local ClerkWebhookSecret
encore secret set --type local AnthropicAPIKey
encore secret set --type local OpenAIAPIKey
encore secret set --type local MongoDBURI
encore secret set --type local QdrantURL
encore secret set --type local UserSecretEncryptionKey  # Generate with: openssl rand -base64 32

# Optional secrets
encore secret set --type local QdrantAPIKey            # If Qdrant auth enabled
encore secret set --type local DaytonaAPIKey           # For workspace features
encore secret set --type local DaytonaAPIURL           # Default: https://app.daytona.io/api
encore secret set --type local BaseDomain              # Default: vaporform.dev
```

See [shared/secrets.ts](shared/secrets.ts) for complete documentation.

### 4. Start Backend

```bash
encore run
```

Access at: http://127.0.0.1:4000
Dashboard: http://127.0.0.1:9400

### 5. Start Frontend

```bash
cd frontend
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
| AI | Claude agentic code generation + terminal agent | 4000 | 6 |
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
cd frontend && npm run dev

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

**Backend**: Encore.ts, PostgreSQL, MongoDB GridFS, Qdrant, Redis, Anthropic Claude, OpenAI (embeddings), Clerk, Dockerode

**Frontend**: Next.js 15, Monaco Editor, xterm.js, Tailwind CSS, React Query

**Infrastructure**: Docker, Traefik, Let's Encrypt, Daytona

## License

MIT
