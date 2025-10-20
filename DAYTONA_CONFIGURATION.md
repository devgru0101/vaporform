# Daytona Configuration Guide

## Overview

Vaporform uses Daytona to provide secure, isolated sandbox environments for running AI-generated code. This document explains how to properly configure Daytona integration.

## Prerequisites

- Daytona account ([Sign up here](https://app.daytona.io/))
- Active Daytona API key

## Configuration Steps

### 1. Obtain Daytona API Key

1. Visit [Daytona Dashboard](https://app.daytona.io/dashboard/)
2. Navigate to [API Keys](https://app.daytona.io/dashboard/keys)
3. Click **Create Key** button
4. Copy the generated API key (format: `dtn<hex_string>`)

### 2. Configure Secrets

Add the Daytona credentials to `.secrets.local.cue`:

```cue
// Daytona workspace management (required for sandbox provisioning)
DaytonaAPIKey: "dtn2529c2d376aa88a5916dd5f5a131584e84f7b5c7aab97bf4d54cc270e4762fac"
DaytonaAPIURL: "https://app.daytona.io/api"
```

**Important Notes:**
- The API key should start with `dtn` (no underscore)
- The API URL is `https://app.daytona.io/api` (not `https://api.daytona.io`)
- Never commit this file to version control (already in `.gitignore`)

### 3. Restart Encore Backend

After updating secrets, restart the backend to load the new configuration:

```bash
fuser -k 4000/tcp 4001/tcp 2>/dev/null
sleep 2
encore run
```

### 4. Verify Configuration

Check the Encore logs for successful initialization:

```
✓ Daytona SDK initialized successfully (API URL: https://app.daytona.io/api)
```

If you see this message, Daytona is properly configured!

## Testing

### Test with GitHub Import

1. Import a GitHub project through the frontend
2. Check backend logs for these messages:

```
[GitHub Import] Detected Node.js/TypeScript project
[DAYTONA DEBUG] createWorkspace called for project <id>
[DAYTONA DEBUG] Created workspace record in DB with ID: <id>
✓ Created Daytona workspace for project: <name> with language: typescript
[DAYTONA DEBUG] Daytona sandbox created with ID: <sandbox_id>
```

3. Verify the workspace has a valid `daytona_sandbox_id` in the database

## Troubleshooting

### Symptom: Workspace shows "running" but no sandbox ID

**Cause:** Daytona API credentials are missing, invalid, or incorrectly formatted.

**Debug Steps:**

1. **Check secrets file:**
   ```bash
   grep -A2 "Daytona" .secrets.local.cue
   ```

2. **Verify API key format:**
   - Should start with `dtn` (no underscore or space)
   - Should be continuous hex string after prefix

3. **Check logs for errors:**
   ```bash
   # Look for Daytona-related errors
   grep -i "daytona\|error" <encore_log_file>
   ```

4. **Common error patterns:**
   - `Error: "<!doctype html>..."` → API key invalid or missing
   - `Cannot sync status - no Daytona SDK` → SDK not initialized
   - `Unknown language 'github-import'` → (Fixed in latest version)

### Symptom: HTML response from Daytona API

**Cause:** Invalid API key or incorrect API URL. The SDK is hitting the marketing website instead of the API.

**Fix:**
1. Verify API URL is exactly: `https://app.daytona.io/api`
2. Ensure API key is valid and active in Daytona dashboard
3. Restart backend after fixing secrets

### Symptom: Workspace stays in "starting" status

**Cause:** Daytona sandbox creation is taking longer than expected or failing.

**Fix:**
1. Check Daytona dashboard for sandbox status
2. Review Daytona logs for rate limiting or quota issues
3. Check if language is supported (python, typescript, javascript)

## Development Mode

If Daytona credentials are not configured, the system operates in **development mode**:

- Workspace records are created in PostgreSQL
- No actual sandboxes are provisioned
- `daytona_sandbox_id` remains `NULL`
- Status shows 'running' but no code can execute

This is useful for:
- Frontend development without backend infrastructure
- Testing workspace management logic
- Local development without Daytona account

## Architecture Notes

### Workspace Creation Flow (GitHub Import)

1. **GitHub repository imported** → Files synced to VFS (GridFS)
2. **Language detection** → Check for `package.json`, `requirements.txt`, etc.
3. **Workspace creation** → Database record created with detected language
4. **Daytona provisioning** → Sandbox created via SDK (background job)
5. **Status update** → Workspace marked as 'running' with sandbox ID

### Language Normalization

The system maps various template/language names to Daytona-supported languages:

- `typescript`, `react`, `nextjs`, `node` → `typescript`
- `python`, `django`, `flask` → `python`
- `javascript`, `vue`, `angular` → `javascript`

See: [workspace/daytona-manager.ts](workspace/daytona-manager.ts) - `normalizeDaytonaLanguage()`

## Security Considerations

- API keys stored in `.secrets.local.cue` (git-ignored)
- Never expose API keys in logs or error messages
- API keys should be rotated periodically
- Use separate keys for development and production

## Production Deployment

For production environments, set secrets via Encore Platform:

```bash
encore secret set --type prod --env production DaytonaAPIKey
encore secret set --type prod --env production DaytonaAPIURL
```

## Support

- **Daytona Documentation**: https://www.daytona.io/docs
- **Daytona Dashboard**: https://app.daytona.io/dashboard/
- **API Keys Management**: https://app.daytona.io/dashboard/keys

## Related Files

- [workspace/daytona-manager.ts](workspace/daytona-manager.ts) - Daytona SDK integration
- [projects/project-api.ts](projects/project-api.ts) - Project creation with workspace provisioning
- [.secrets.local.cue](.secrets.local.cue) - Local secrets configuration
- [CLAUDE.md](CLAUDE.md) - Main documentation with Daytona configuration section
