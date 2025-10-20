# Terminal Integration Guide - Daytona Web Terminal

This document explains how to integrate the interactive terminal UI with Daytona's web terminal.

## Overview

Vaporform provides an interactive terminal UI that connects directly to Daytona sandboxes via their web terminal interface (port 22222). This is different from the Terminal Agent (AI-powered terminal) - this is a traditional PTY terminal for manual command execution.

## Problem We Solved

**Previous Issue**: The system was showing "Connected to terminal" but users couldn't interact with it. The Daytona dashboard showed sandboxes as "stopped" while Vaporform showed them as "running".

**Root Cause**: The system was creating mock sandboxes ("dev-sandbox-XXX") instead of connecting to real Daytona sandboxes with working terminals.

**Solution**: Proper integration with Daytona's web terminal via port 22222 preview URLs.

## Architecture

```
┌─────────────────────────────────┐
│    Frontend Terminal UI         │
│                                 │
│  1. User clicks Terminal button │
│  2. Fetches terminal URL        │
│  3. Opens Daytona terminal      │
└───────────┬─────────────────────┘
            │
            │ GET /workspace/:id/terminal-url
            ▼
┌─────────────────────────────────┐
│    Backend API                  │
│                                 │
│  workspace-api.ts               │
│  - getTerminalUrl()             │
└───────────┬─────────────────────┘
            │
            │ daytonaManager.getTerminalUrl()
            ▼
┌─────────────────────────────────┐
│    DaytonaManager               │
│                                 │
│  daytona-manager.ts             │
│  - Syncs workspace status       │
│  - Calls getPreviewLink(22222)  │
└───────────┬─────────────────────┘
            │
            │ sandbox.getPreviewLink(22222)
            ▼
┌─────────────────────────────────┐
│    Daytona API                  │
│                                 │
│  Returns web terminal URL       │
│  https://22222-<id>.daytona...  │
└─────────────────────────────────┘
```

## Backend Implementation

### 1. DaytonaManager.getTerminalUrl()

Location: `workspace/daytona-manager.ts:677-706`

```typescript
async getTerminalUrl(workspaceId: bigint): Promise<string | null> {
  const workspace = await this.getWorkspace(workspaceId);

  if (!workspace.daytona_sandbox_id || !this.daytona) {
    console.log(`[DAYTONA] Cannot get terminal URL - no sandbox ID or Daytona SDK`);
    return null;
  }

  // Skip mock sandboxes
  if (workspace.daytona_sandbox_id.startsWith('dev-sandbox-')) {
    console.log(`[DAYTONA] Cannot get terminal URL for mock sandbox`);
    return null;
  }

  try {
    const sandbox = await this.getSandbox(workspace);
    console.log(`[DAYTONA] Getting terminal URL for sandbox ${sandbox.id} on port 22222`);

    // Get preview link for port 22222 (Daytona web terminal)
    const terminalPreview = await sandbox.getPreviewLink(22222);
    console.log(`[DAYTONA] ✓ Got terminal URL: ${terminalPreview.url}`);

    return terminalPreview.url;
  } catch (error) {
    console.error(`[DAYTONA] Error getting terminal URL for workspace ${workspaceId}:`, error);
    return null;
  }
}
```

**Key Points**:
- Returns null for mock sandboxes (old workspaces created before API key was set)
- Port 22222 is Daytona's standard web terminal port
- Returns URL like: `https://22222-37d3023e-7ff9-4d25-92ee-31c500c9a66a.proxy.daytona.works/`

### 2. API Endpoint

Location: `workspace/workspace-api.ts:488-513`

```typescript
export const getTerminalUrl = api(
  { method: 'GET', path: '/workspace/:workspaceId/terminal-url' },
  async (req: GetSandboxUrlRequest): Promise<{ url: string | null }> => {
    const { userId } = await verifyClerkJWT(req.authorization);
    const workspaceId = BigInt(req.workspaceId);

    let workspace = await daytonaManager.getWorkspace(workspaceId);
    await ensureProjectPermission(userId, workspace.project_id, 'view');

    // Sync status with Daytona API before getting terminal URL
    workspace = await daytonaManager.syncWorkspaceStatus(workspaceId);

    // Get terminal URL (Daytona web terminal on port 22222)
    const url = await daytonaManager.getTerminalUrl(workspaceId);

    if (!url) {
      console.log(`[Terminal API] No terminal URL available for workspace ${workspaceId}`);
    }

    return { url };
  }
);
```

**Features**:
- Authenticates user
- Checks project permissions
- Syncs workspace status with Daytona (fixes status mismatch issue)
- Returns null if terminal not available

### 3. Automatic Status Sync

Location: `workspace/daytona-manager.ts:483-518`

The `getProjectWorkspace()` method now automatically syncs status with Daytona API before returning:

```typescript
async getProjectWorkspace(projectId: bigint): Promise<Workspace | null> {
  // ... fetch workspace from database ...

  if (workspace) {
    // Automatically sync status with Daytona API before returning
    try {
      workspace = await this.syncWorkspaceStatus(workspace.id);
      console.log(`[DAYTONA DEBUG] ✓ Status synced, current status: ${workspace.status}`);
    } catch (error) {
      console.error(`[DAYTONA DEBUG] Failed to sync workspace status:`, error);
      // Continue with cached status if sync fails
    }
  }

  return workspace || null;
}
```

**Why This Matters**:
- Frontend always sees the real Daytona status
- No more "running" in Vaporform but "stopped" in Daytona dashboard
- Terminal only shows when sandbox is actually running

### 4. No More Mock Sandboxes

Location: `workspace/daytona-manager.ts:333-349`

**Previous Code** (REMOVED):
```typescript
// No Daytona SDK - development mode
const mockSandboxId = `dev-sandbox-${workspaceId}-${Date.now()}`;
await db.exec`UPDATE workspaces SET status = 'running', daytona_sandbox_id = ${mockSandboxId}...`;
```

**New Code**:
```typescript
// No Daytona SDK - this is an error condition
const errorMsg = 'Daytona API key not configured. Please set DAYTONA_API_KEY environment variable.';
await db.exec`UPDATE workspaces SET status = 'error', error_message = ${errorMsg}...`;
throw new Error(errorMsg);
```

**Impact**:
- Workspaces now REQUIRE a valid Daytona API key
- No more fake "running" workspaces without real sandboxes
- Clear error messages when configuration is missing

## Frontend Integration

### Step 1: Fetch Terminal URL

When user clicks the Terminal button/tab:

```typescript
const fetchTerminalUrl = async (workspaceId: bigint) => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/workspace/${workspaceId}/terminal-url`,
      {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      }
    );

    const data = await response.json();

    if (data.url) {
      return data.url;
    } else {
      console.error('No terminal URL available');
      return null;
    }
  } catch (error) {
    console.error('Failed to fetch terminal URL:', error);
    return null;
  }
};
```

### Step 2: Display Terminal

**Option A: Embed in iframe** (Recommended - Simpler)

```tsx
const TerminalPanel = ({ workspaceId }: { workspaceId: bigint }) => {
  const [terminalUrl, setTerminalUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadTerminal = async () => {
      setLoading(true);
      const url = await fetchTerminalUrl(workspaceId);
      setTerminalUrl(url);
      setLoading(false);
    };

    loadTerminal();
  }, [workspaceId]);

  if (loading) {
    return <div>Loading terminal...</div>;
  }

  if (!terminalUrl) {
    return (
      <div className="terminal-error">
        <p>Terminal not available</p>
        <p>Make sure the workspace is running and Daytona API key is configured</p>
      </div>
    );
  }

  return (
    <iframe
      src={terminalUrl}
      className="terminal-iframe"
      style={{
        width: '100%',
        height: '100%',
        border: 'none',
        background: '#1e1e1e'
      }}
      title="Daytona Terminal"
    />
  );
};
```

**Option B: Open in new tab/window**

```typescript
const openTerminal = async (workspaceId: bigint) => {
  const url = await fetchTerminalUrl(workspaceId);

  if (url) {
    window.open(url, '_blank', 'width=1200,height=800');
  } else {
    alert('Terminal not available. Please ensure the workspace is running.');
  }
};
```

### Step 3: Handle Edge Cases

```typescript
const TerminalPanel = ({ workspaceId, workspace }: Props) => {
  // Check workspace status before showing terminal
  if (workspace.status !== 'running') {
    return (
      <div className="terminal-unavailable">
        <p>Terminal unavailable</p>
        <p>Workspace status: {workspace.status}</p>
        {workspace.status === 'stopped' && (
          <button onClick={() => startWorkspace(workspaceId)}>
            Start Workspace
          </button>
        )}
      </div>
    );
  }

  // Check for mock sandboxes (legacy workspaces)
  if (workspace.daytona_sandbox_id?.startsWith('dev-sandbox-')) {
    return (
      <div className="terminal-error">
        <p>Legacy workspace detected</p>
        <p>This workspace was created before Daytona integration was configured.</p>
        <button onClick={() => rebuildWorkspace(workspaceId)}>
          Rebuild Workspace
        </button>
      </div>
    );
  }

  // Normal terminal display
  return <TerminalIframe workspaceId={workspaceId} />;
};
```

## Testing

### Manual Testing Checklist

- [ ] Terminal URL endpoint returns valid URL for running workspaces
- [ ] Terminal URL endpoint returns null for stopped workspaces
- [ ] Terminal URL endpoint returns null for mock sandboxes
- [ ] Status sync correctly updates "stopped" workspaces
- [ ] Embedded terminal iframe loads and is interactive
- [ ] Terminal shows proper error message when workspace not running
- [ ] No more mock sandboxes created (all new workspaces require Daytona API key)

### Test Scenarios

**Scenario 1: Happy Path**
1. Create project with valid Daytona API key configured
2. Wait for workspace to start (status: 'running')
3. Click Terminal button
4. Verify terminal URL is fetched: `https://22222-<id>.proxy.daytona.works/`
5. Verify terminal loads in iframe
6. Type commands and verify they execute

**Scenario 2: Stopped Workspace**
1. Stop a running workspace
2. Click Terminal button
3. Verify frontend shows "Terminal unavailable - Workspace stopped"
4. Verify no terminal URL is returned

**Scenario 3: Mock Sandbox (Legacy)**
1. Find workspace with `daytona_sandbox_id` starting with "dev-sandbox-"
2. Click Terminal button
3. Verify error message about legacy workspace
4. Verify terminal URL returns null

**Scenario 4: No API Key**
1. Remove `DAYTONA_API_KEY` environment variable
2. Try to create new workspace
3. Verify workspace enters 'error' state
4. Verify error message mentions missing API key

## API Reference

### GET /workspace/:workspaceId/terminal-url

Returns the Daytona web terminal URL for a workspace.

**URL Parameters**:
- `workspaceId` (bigint): The workspace ID

**Headers**:
- `Authorization`: Bearer token (Clerk JWT)

**Response** (200 OK):
```json
{
  "url": "https://22222-37d3023e-7ff9-4d25-92ee-31c500c9a66a.proxy.daytona.works/"
}
```

**Response** (200 OK - No Terminal):
```json
{
  "url": null
}
```

**Errors**:
- 401: Unauthorized (invalid/missing auth token)
- 403: Forbidden (user doesn't have permission to view this project)
- 404: Workspace not found

## Troubleshooting

### Terminal URL is null

**Possible Causes**:
1. Workspace is not running (check `workspace.status`)
2. Workspace is a mock sandbox (`daytona_sandbox_id` starts with "dev-sandbox-")
3. `DAYTONA_API_KEY` not configured
4. Sandbox was deleted from Daytona but still exists in database

**Solutions**:
1. Start the workspace if stopped
2. Rebuild legacy workspaces
3. Set `DAYTONA_API_KEY` environment variable
4. Check Daytona dashboard to verify sandbox exists

### Terminal shows "Connected" but not interactive

**Solution**: This issue is now fixed. Make sure you're using the new terminal URL endpoint instead of the old WebSocket PTY connection.

### Status mismatch (Running in Vaporform, Stopped in Daytona)

**Solution**: This is now fixed by automatic status sync in `getProjectWorkspace()`. The status is synced every time the workspace is fetched.

### "Daytona API key not configured" error

**Solution**: Set the `DAYTONA_API_KEY` environment variable in your backend `.env` file:
```bash
DAYTONA_API_KEY=dtn_your_api_key_here
```

## Migration Guide

### For Existing Workspaces

If you have existing workspaces created before this integration:

1. **Identify mock sandboxes**:
```sql
SELECT id, project_id, daytona_sandbox_id, status
FROM workspaces
WHERE daytona_sandbox_id LIKE 'dev-sandbox-%'
AND deleted_at IS NULL;
```

2. **Option A: Rebuild workspaces** (Recommended):
```typescript
// Use the force rebuild endpoint
await fetch(`/workspace/rebuild/${projectId}`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` }
});
```

3. **Option B: Manual cleanup**:
```sql
-- Mark old workspaces as deleted
UPDATE workspaces
SET status = 'deleted', deleted_at = NOW()
WHERE daytona_sandbox_id LIKE 'dev-sandbox-%';
```

Then create new workspaces normally - they will use real Daytona sandboxes.

## Related Documentation

- [Daytona LLM Instructions](./daytona-llm-instructions/) - Official Daytona integration guide
- [Terminal Agent Integration](./TERMINAL_AGENT_INTEGRATION.md) - AI-powered terminal agent (different from this)
- [Workspace API](./workspace/workspace-api.ts) - Workspace management endpoints
- [Daytona Manager](./workspace/daytona-manager.ts) - Core Daytona integration logic

## Changelog

### 2025-10-15
- ✅ Added `getTerminalUrl()` method to DaytonaManager
- ✅ Added `/workspace/:id/terminal-url` API endpoint
- ✅ Removed mock sandbox creation logic
- ✅ Added automatic status sync to `getProjectWorkspace()`
- ✅ Fixed status mismatch between Vaporform and Daytona dashboard
- ✅ Added proper error handling for missing API key

### Previous Behavior (DEPRECATED)
- ❌ Created mock "dev-sandbox-XXX" sandboxes
- ❌ WebSocket PTY connections (local or Daytona PTY)
- ❌ Status not synced with Daytona API
- ❌ Terminal showed "Connected" but wasn't interactive
