# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Vaporform is a cloud-based agentic development environment with AI-powered code generation, built as a microservices architecture using Encore.ts. The system provides a complete virtual development environment with file storage, git integration, AI assistance (powered by Claude), and deployment capabilities.

## Tech Stack

- **Backend**: Encore.ts microservices framework (10 services)
- **Databases**: PostgreSQL (metadata), MongoDB GridFS (file storage), Qdrant (vector embeddings), Redis (cache/sessions)
- **AI**: Anthropic Claude (claude-sonnet-4-5, claude-opus-4-5) for agentic code generation
- **AI Embeddings**: OpenAI text-embedding-3-small for vector embeddings (RAG)
- **Auth**: Clerk (multi-tenant with organizations and RBAC)
- **Frontend**: Next.js 15 (monorepo at ./frontend)
- **Infrastructure**: Docker, Traefik, Daytona workspaces

## Development Commands

### Starting the Application

```bash
# Start infrastructure (MongoDB, Qdrant, Redis)
./quick-start.sh

# Start Encore backend (includes PostgreSQL)
encore run

# Run tests
encore test

# View Encore dashboard
# Access at http://127.0.0.1:9400 when Encore is running

# Stop infrastructure
docker compose down
```

### Database Operations

```bash
# Access PostgreSQL database for a specific service
encore db shell <service-name>

# Example: Access projects database
encore db shell projects

# View database connection strings
encore db conn-uri <service-name>

# Run migrations manually
encore db migrations apply
```

### Docker Management

```bash
# Check running containers
docker compose ps

# View logs for all services
docker compose logs -f

# View logs for specific service
docker compose logs -f mongodb
docker compose logs -f qdrant
docker compose logs -f redis

# Restart infrastructure
docker compose restart
```

### Debugging

```bash
# Monitor Encore logs with detailed output
encore run --debug

# Check Docker daemon status
docker ps

# Verify database connections
docker compose exec mongodb mongosh -u vaporform -p vaporform_dev_password
```

## Architecture

### Service Overview

Vaporform consists of 10 microservices, each with its own PostgreSQL database managed by Encore:

1. **users** - User management, settings, and Clerk webhooks
2. **organizations** - Multi-tenant organization management with RBAC
3. **projects** - Project CRUD with permission checks and quota enforcement
4. **vfs** - Virtual File System using MongoDB GridFS for complete project isolation
5. **git** - Version control operations with commit tracking
6. **vector** - Qdrant vector embeddings for RAG (codebase search)
7. **ai** - AI-powered code generation and terminal assistance:
   - Claude-powered agentic code generation with tool use (agent-api.ts)
   - Terminal agent with cross-agent context (terminal-agent-api.ts)
   - Project generation orchestration (project-generator.ts)
8. **workspace** - Daytona workspace management for build environments
9. **infra** - Docker deployment management with container orchestration
10. **billing** - Usage tracking and subscription quota enforcement
11. **terminal** - WebSocket-based PTY sessions for interactive shell access

### Key Architectural Patterns

#### 1. Microservices Communication

Services communicate via direct function calls (Encore's service mesh):

```typescript
// Import and call another service
import { getProject } from '../projects/project-api.js';
const project = await getProject({ authorization, projectId });
```

#### 2. Authentication & Authorization

All API endpoints use Clerk JWT verification:

```typescript
import { verifyClerkJWT } from '../shared/clerk-auth.js';
import { ensureProjectPermission } from '../projects/permissions.js';

const { userId } = await verifyClerkJWT(req.authorization);
await ensureProjectPermission(userId, projectId, 'edit');
```

Permission levels: `'view' | 'edit' | 'delete'`

#### 3. Database Isolation

Each service has its own PostgreSQL database defined in `db.ts`:

```typescript
import { SQLDatabase } from 'encore.dev/storage/sqldb';

export const db = new SQLDatabase('service_name', {
  migrations: './migrations',
});
```

MongoDB GridFS is shared but isolated by `project_id`.

#### 4. Virtual File System

Files are stored in MongoDB GridFS with metadata in PostgreSQL:
- GridFS stores file content (chunked at 255KB)
- PostgreSQL stores metadata (path, size, version, mime type)
- Complete tenant isolation via `project_id`
- Soft deletes for versioning support

Key implementation: [vfs/gridfs.ts](vfs/gridfs.ts)

#### 5. Subscription & Quotas

Subscription limits are enforced at project creation and resource usage:
- Free: 3 projects, 1GB storage, 10 hours compute
- Pro: Unlimited projects, 10GB storage, 100 hours compute
- Team: 50GB storage, 500 hours compute, unlimited collaborators
- Enterprise: 1TB storage, unlimited compute

See: [shared/types.ts](shared/types.ts) - `SUBSCRIPTION_LIMITS`

#### 6. AI Integration - Claude-Powered Agentic System

**Claude Agentic Code Generation**
- Location: [ai/agent-api.ts](ai/agent-api.ts), [ai/terminal-agent-api.ts](ai/terminal-agent-api.ts)
- Model: `claude-sonnet-4-5-20250929`
- Features:
  - Tool use for file operations, git, terminal, workspace management
  - Agentic code generation with direct file system access
  - Cross-agent context sharing via unified session manager
  - User API keys stored encrypted in PostgreSQL (pgcrypto AES-256)
  - Supports both user-provided keys and system-wide AnthropicAPIKey Encore secret
- Key files:
  - [ai/agent-api.ts](ai/agent-api.ts) - Main agent API
  - [ai/terminal-agent-api.ts](ai/terminal-agent-api.ts) - Terminal agent with context awareness
  - [ai/tool-handlers.ts](ai/tool-handlers.ts) - Tool implementations
  - [ai/project-generator.ts](ai/project-generator.ts) - Project scaffolding with Claude
  - [ai/context-manager.ts](ai/context-manager.ts) - Unified session and context tracking

#### 7. Vector Embeddings - OpenAI for RAG

**OpenAI Vector Embeddings**
- Location: [vector/qdrant-manager.ts](vector/qdrant-manager.ts)
- Model: `text-embedding-3-small` (1536 dimensions)
- Features:
  - Code file embeddings for semantic search
  - RAG context retrieval for agent responses
  - Conversation indexing
  - Content deduplication via SHA-256 hashing
- Storage: Qdrant vector database with PostgreSQL metadata tracking
- Note: OpenAI is used **only** for embeddings; Claude handles all chat/generation

### Critical Implementation Details

#### Project Lifecycle

When a project is created:
1. Project record created in PostgreSQL
2. Daytona workspace automatically provisioned
3. If `generateCode: true`, Claude project generation starts
4. VFS root directory initialized
5. Git repository initialized (optional)

When a project is deleted:
1. Daytona workspace destroyed
2. Vector embeddings removed from Qdrant
3. Files deleted from GridFS and metadata cleaned
4. Chat sessions and messages deleted
5. Workspace records removed
6. Project soft-deleted in PostgreSQL

See: [projects/project-api.ts](projects/project-api.ts) - `deleteProject`

#### File Operations

All file operations go through the GridFS abstraction:
- Files are versioned (version increments on each write)
- Directories are metadata-only entries (`is_directory: true`)
- Parent directories are created automatically
- Soft deletes preserve history

Common operations:
```typescript
import { gridfs } from '../vfs/gridfs.js';

// Write file
await gridfs.writeFile(projectId, '/src/index.ts', content, 'text/typescript');

// Read file
const buffer = await gridfs.readFile(projectId, '/src/index.ts');

// List directory
const files = await gridfs.listDirectory(projectId, '/src');

// Delete (recursive)
await gridfs.delete(projectId, '/old-dir', true);
```

#### Git Integration

Git operations are performed on the virtual file system:
- Uses `simple-git` library for operations
- Commits are tracked in PostgreSQL with metadata
- Git repositories stored in GridFS like regular files
- Visual rollback supported via commit history

Key file: [git/git-manager.ts](git/git-manager.ts)

#### Daytona Workspaces

Workspaces provide isolated build environments:
- Auto-created when projects are viewed (smart workspace management)
- Auto-start if stopped, recovery if errored
- Configurable auto-stop (60 min) and auto-archive (24 hours)
- Environment variables injected per project

See: [workspace/daytona-manager.ts](workspace/daytona-manager.ts)

**Configuration Requirements:**
To enable Daytona sandbox provisioning, you must configure the Daytona API credentials in `.secrets.local.cue`:

```cue
// Daytona workspace management (required for sandbox provisioning)
DaytonaAPIKey: "dtn<your_api_key_here>"          // Get from https://app.daytona.io/dashboard/keys
DaytonaAPIURL: "https://app.daytona.io/api"      // Official Daytona API endpoint
```

**How to Obtain Daytona API Key:**
1. Visit [Daytona Dashboard](https://app.daytona.io/dashboard/)
2. Navigate to [API Keys](https://app.daytona.io/dashboard/keys)
3. Click **Create Key** button
4. Copy the generated key (starts with `dtn`)
5. Add to `.secrets.local.cue` as shown above
6. Restart Encore backend: `encore run`

**Verification:**
When properly configured, you should see this log on startup:
```
✓ Daytona SDK initialized successfully (API URL: https://app.daytona.io/api)
```

If credentials are missing or invalid, workspaces will be created in development mode (database records only, no actual sandboxes).

#### Terminal Sessions

WebSocket-based PTY sessions for shell access:
- Runs on separate port (4001) from main API
- Uses `node-pty` for pseudo-terminal
- Sessions tracked in PostgreSQL
- Auto-cleanup of inactive sessions

Key file: [terminal/terminal-manager.ts](terminal/terminal-manager.ts)

#### User API Keys

Users can provide their own Anthropic API keys:
- Stored encrypted in `user_secrets` table using PostgreSQL pgcrypto (AES-256)
- Accessed via [users/secrets.ts](users/secrets.ts)
- Falls back to system `AnthropicAPIKey` Encore secret if user key not set
- User settings managed in [users/settings-api.ts](users/settings-api.ts)
- Encryption key stored as `UserSecretEncryptionKey` Encore secret (must never change)

```typescript
// Get user's Claude API key with system fallback
import { secret } from 'encore.dev/config';
import { getUserAnthropicKey } from '../users/secrets.js';

// Define Anthropic API key secret locally
const anthropicAPIKey = secret("AnthropicAPIKey");

let apiKey = await getUserAnthropicKey(userId);
if (!apiKey) {
  apiKey = anthropicAPIKey(); // System fallback
}
```

## Secret Management

**All secrets are managed via Encore's built-in secrets manager** (no environment variables).

### Required Secrets

Set these via `encore secret set --type local <SecretName>`:

```bash
# Authentication
ClerkSecretKey                # Clerk backend authentication key
ClerkPublishableKey           # Clerk frontend key
ClerkWebhookSecret            # Clerk webhook verification secret

# AI Services
AnthropicAPIKey               # Claude API for code generation (system fallback)
OpenAIAPIKey                  # OpenAI for vector embeddings only

# Databases
MongoDBURI                    # MongoDB GridFS connection string
QdrantURL                     # Qdrant vector database URL

# Encryption
UserSecretEncryptionKey       # AES-256 key for user API keys (32+ chars, NEVER change!)
```

### Optional Secrets

```bash
QdrantAPIKey                  # Qdrant authentication (if enabled)
DaytonaAPIKey                 # Daytona workspace management
DaytonaAPIURL                 # Daytona API endpoint (default: https://app.daytona.io/api)
BaseDomain                    # Base domain for deployments (default: vaporform.dev)
```

### Quick Setup

Run the interactive setup script for local development:

```bash
./scripts/setup-local-secrets.sh
```

### Secret Access in Code

**Per-Service Secret Definitions**

Encore secrets must be defined locally in each file that uses them. Secret names are globally unique, so multiple files can define the same secret name and receive the same value.

```typescript
import { secret } from 'encore.dev/config';

// Define secrets locally in each file that needs them
// Note: Secret names are globally unique - same name = same value everywhere
const anthropicAPIKey = secret("AnthropicAPIKey");
const mongoDBURI = secret("MongoDBURI");
const clerkSecretKey = secret("ClerkSecretKey");

// Call secret functions to access values
const apiKey = anthropicAPIKey();
const dbUri = mongoDBURI();
const clerkKey = clerkSecretKey();
```

**Why Per-Service Definitions?**
- Encore requires `secret()` calls to be within service directories or local files
- Each service explicitly declares its secret dependencies
- Encore can validate and track which secrets each service needs
- Better for microservices architecture and independent deployments

**Examples in Codebase:**
- [ai/agent-api.ts](ai/agent-api.ts) - Defines `AnthropicAPIKey` locally
- [vfs/gridfs.ts](vfs/gridfs.ts) - Defines `MongoDBURI` locally
- [shared/clerk-auth.ts](shared/clerk-auth.ts) - Defines Clerk secrets locally
- [workspace/daytona-manager.ts](workspace/daytona-manager.ts) - Defines Daytona secrets locally

For user-specific secrets with encryption:

```typescript
import { getUserAnthropicKey, setUserAnthropicKey } from '../users/secrets.js';

// Get user's API key (decrypts automatically using pgcrypto)
const userKey = await getUserAnthropicKey(userId);

// Set user's API key (encrypts automatically using pgcrypto)
await setUserAnthropicKey(userId, 'sk-ant-...');
```

See: [users/secrets.ts](users/secrets.ts) for encrypted user API key management

## Common Development Workflows

### Adding a New API Endpoint

1. Add endpoint to service's API file (e.g., `projects/project-api.ts`)
2. Use Encore API decorator: `api({ method: 'POST', path: '/...' })`
3. Add Clerk JWT verification
4. Add permission checks if accessing resources
5. Encore automatically registers the endpoint

### Adding a Database Table

1. Create migration file: `migrations/N_description.up.sql`
2. Create corresponding down migration: `migrations/N_description.down.sql`
3. Define TypeScript interface in `shared/types.ts`
4. Encore applies migrations automatically on startup

### Integrating a New Service

1. Create service directory with `encore.service.ts`:
   ```typescript
   import { Service } from "encore.dev/service";
   export default new Service("service_name");
   ```
2. Add `db.ts` if service needs database
3. Create `migrations/` directory
4. Add API endpoints in `*-api.ts` files
5. Encore automatically discovers and includes the service

### Adding Claude Tool Support

1. Define tool schema in [ai/agent-api.ts](ai/agent-api.ts) `toolDefinitions` array
2. Implement tool handler in [ai/tool-handlers.ts](ai/tool-handlers.ts)
3. Tool handler receives parsed parameters and should return JSON result
4. Tools have access to full context: projectId, workspaceId, userId

Example tool structure:
```typescript
{
  name: "write_file",
  description: "Write content to a file in the project",
  input_schema: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path" },
      content: { type: "string", description: "File content" }
    },
    required: ["path", "content"]
  }
}
```

### Testing Changes

```bash
# Run all tests
encore test

# Run specific service tests
encore test ./users

# Run with verbose output
encore test --verbose

# Check types
npx tsc --noEmit
```

## Troubleshooting

### Encore Won't Start

Check Docker permissions:
```bash
# Verify Docker access (should work without sudo)
docker ps

# If permission denied, refresh session
newgrp docker
```

### Database Connection Issues

```bash
# Check PostgreSQL status (Encore manages its own)
encore db shell <service>

# Check MongoDB
docker compose exec mongodb mongosh -u vaporform -p vaporform_dev_password

# Check Qdrant
curl http://localhost:6333/collections

# Check Redis
docker compose exec redis redis-cli ping
```

### File Operations Failing

Ensure MongoDB GridFS is connected:
```bash
# Check MongoDB logs
docker compose logs mongodb

# Verify connection in code
# GridFS connects automatically on first use
```

### Claude API Errors

Check API key configuration:
```bash
# Verify Encore secret is set
encore secret set --type local AnthropicAPIKey

# User-provided keys are stored encrypted in PostgreSQL
# Check via settings API or user_secrets table
```

### Service Import Errors

Always use `.js` extension for imports (ESM):
```typescript
// Correct
import { something } from '../other-service/file.js';

// Wrong
import { something } from '../other-service/file';
```

### Daytona Sandbox Not Created

If workspaces show "running" status but have no sandbox ID:

**Symptoms:**
- Backend logs show: `[DAYTONA] Cannot sync status - no Daytona SDK or sandbox ID`
- Workspace has status 'running' but `daytona_sandbox_id: NONE`
- Daytona API returning HTML instead of JSON responses

**Solution:**
1. Verify Daytona credentials are configured in `.secrets.local.cue`:
   ```bash
   # Check if credentials are set
   grep -A2 "Daytona" .secrets.local.cue
   ```

2. Ensure API key format is correct (starts with `dtn`, no underscore):
   ```cue
   DaytonaAPIKey: "dtn2529c2d376aa88a5916dd5f5a131584e84f7b5c7aab97bf4d54cc270e4762fac"
   DaytonaAPIURL: "https://app.daytona.io/api"
   ```

3. Restart Encore backend to load credentials:
   ```bash
   fuser -k 4000/tcp 4001/tcp 2>/dev/null
   sleep 2
   encore run
   ```

4. Verify initialization in logs:
   ```
   ✓ Daytona SDK initialized successfully (API URL: https://app.daytona.io/api)
   ```

5. Test by importing a GitHub project - you should see:
   ```
   [GitHub Import] Detected Node.js/TypeScript project
   ✓ Created Daytona workspace for project: <name> with language: typescript
   ```

## Service Dependencies

```
┌─────────────────┐
│   Frontend      │
│   (Next.js)     │
└────────┬────────┘
         │
┌────────▼─────────────────────────────┐
│       Encore API Gateway              │
│                                       │
│  ┌──────────┐  ┌──────────────────┐ │
│  │  users   │  │  organizations   │ │
│  └────┬─────┘  └────┬─────────────┘ │
│       │             │                │
│  ┌────▼─────────────▼────┐          │
│  │      projects          │          │
│  └─┬──────┬──────┬────┬──┘          │
│    │      │      │    │              │
│  ┌─▼──┐ ┌▼───┐ ┌▼──┐ ┌▼────────┐   │
│  │vfs │ │git │ │ai │ │workspace│   │
│  └─┬──┘ └──┬─┘ └─┬─┘ └───┬─────┘   │
│    │       │     │       │           │
│  ┌─▼───────▼─────▼───────▼───────┐ │
│  │     vector (Qdrant RAG)       │ │
│  │     (TODO: OpenAI embeddings) │ │
│  └────────────────────────────────┘ │
│                                      │
│  ┌──────────┐  ┌─────────────────┐ │
│  │  infra   │  │    billing      │ │
│  └──────────┘  └─────────────────┘ │
│                                      │
│  ┌──────────────────────────────┐  │
│  │    terminal (WebSocket)      │  │
│  └──────────────────────────────┘  │
└──────────────────────────────────────┘
```

## Code Style Notes

- Use TypeScript strict mode
- Prefer `bigint` for database IDs
- Use Encore's tagged template literals for SQL queries
- Follow ESM module conventions (`.js` imports)
- Log important operations with `console.log` (visible in Encore dashboard)
- Use `toAPIError()` wrapper for consistent error responses
- Validate inputs before database operations
- Soft delete when possible (set `deleted_at`)

## TODO Items

### High Priority
1. **Enhance OpenAI Vector Embeddings Integration**
   - Automatically generate embeddings when files are created/modified
   - Add batch embedding generation for existing codebases
   - Implement semantic code search UI in frontend
   - Optimize RAG context retrieval performance

2. **Improve Claude Tool Error Handling**
   - Add retry logic for transient failures
   - Better error messages to Claude
   - Validate tool parameters before execution
   - Add tool execution monitoring and analytics

### Medium Priority
3. **AST-based UI Component Extraction**
   - Replace simple regex parsing in `extractUIComponent`
   - Use Babel/TypeScript parser for accurate extraction
   - Support multiple component frameworks (React, Vue, Svelte)

4. **Enhanced Cross-Agent Context Sharing**
   - Expand context-manager.ts with more context types
   - Add agent-to-agent communication for complex workflows
   - Implement context pruning strategies for long sessions

## Resources

- Encore.ts docs: https://encore.dev/docs
- MongoDB GridFS: https://docs.mongodb.com/manual/core/gridfs/
- Qdrant vector DB: https://qdrant.tech/documentation/
- Clerk auth: https://clerk.com/docs
- Anthropic Claude: https://docs.anthropic.com/
- OpenAI API: https://platform.openai.com/docs
- Daytona: https://www.daytona.io/docs
