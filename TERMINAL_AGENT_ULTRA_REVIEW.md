# Terminal Agent Ultra Code Review
**Date**: 2025-10-18
**Purpose**: Comprehensive analysis of terminal agent's Daytona sandbox awareness, tool suite, and automatic error forwarding capabilities

---

## Executive Summary

The terminal agent has **solid foundations** but is **critically missing automatic error forwarding** from the Daytona sandbox. It lacks the comprehensive Daytona-specific tool suite needed to effectively debug build and runtime issues. The agent currently operates reactively (user asks → agent investigates) instead of proactively (errors flow → agent auto-diagnoses).

### Critical Findings

🔴 **CRITICAL**: No automatic error forwarding from sandbox to terminal agent
🟡 **MAJOR**: Missing Daytona-specific tools (get build logs, check dev server status, etc.)
🟡 **MAJOR**: No integration with build-manager for automatic error notifications
🟢 **GOOD**: Cross-agent context awareness implemented
🟢 **GOOD**: Basic bash execution in Daytona sandbox works

---

## Part 1: Terminal Agent's Daytona Sandbox Awareness

### Current State: ✅ PARTIALLY AWARE

**File**: `/home/ssitzer/projects/vaporform/ai/terminal-agent-api.ts`

#### What Works ✅

1. **Workspace Context Available**
   - Terminal agent receives `workspaceId` parameter in requests (line 28)
   - Workspace ID is passed to session metadata (line 74)
   - Tool execution context includes workspaceId (lines 221-225)

2. **Cross-Agent Context Sharing**
   - Integration with context-manager.ts (line 12)
   - Receives recent code generation activity (lines 445-448)
   - Sees recent errors from code agent (lines 450-453)
   - Knows about recently modified files (lines 460-463)

3. **System Prompt Awareness**
   - Explicitly tells agent it's working with Daytona sandbox (line 439)
   - Includes project ID and workspace ID in context (lines 436-437)
   - Mentions "isolated Daytona sandbox" (line 439)

#### What's Missing 🔴

1. **No Real-Time Sandbox State**
   ```typescript
   // System prompt only mentions:
   // "All commands execute in isolated Daytona sandbox (if workspace configured)"

   // MISSING:
   // - Current sandbox status (running/stopped/error)
   // - Active dev server status
   // - Current build phase
   // - Running processes
   // - Open ports
   ```

2. **No Automatic Error Context**
   - Agent isn't automatically notified when builds fail
   - No integration with build event stream
   - Doesn't receive dev server crash notifications
   - No automatic PTY output forwarding

3. **Limited Sandbox Metadata**
   ```typescript
   // Current context (lines 436-438):
   - Project ID: ${projectId}
   - Workspace ID: ${workspaceId || 'N/A'}
   - Platform: Vaporform Cloud Development Environment

   // SHOULD INCLUDE:
   - Sandbox ID: ${workspace.daytona_sandbox_id}
   - Sandbox Status: ${workspace.status}
   - Tech Stack: ${techStack.language}/${techStack.framework}
   - Dev Server Port: ${detectedPort}
   - Latest Build Status: ${build.status} (${build.phase})
   ```

---

## Part 2: Terminal Agent's Tool Suite Review

### Current Tools: ✅ BASIC FILE/COMMAND TOOLS

**File**: `/home/ssitzer/projects/vaporform/ai/terminal-agent-tools.ts`

#### Existing Tools (11 total)

| Tool | Purpose | Daytona Aware? | Effectiveness |
|------|---------|----------------|---------------|
| `bash` | Execute commands | ✅ YES (lines 286-310) | 🟢 GOOD |
| `read_file` | Read from VFS | ❌ NO (VFS only) | 🟢 GOOD |
| `write_file` | Write to VFS | ❌ NO (VFS only) | 🟢 GOOD |
| `edit_file` | Find/replace in VFS | ❌ NO (VFS only) | 🟢 GOOD |
| `glob` | Find files by pattern | ❌ NO (VFS only) | 🟢 GOOD |
| `grep` | Search file contents | ❌ NO (VFS only) | 🟢 GOOD |
| `ls` | List directory | ❌ NO (VFS only) | 🟢 GOOD |
| `build_status` | Get build info | ✅ YES (lines 625-686) | 🟡 LIMITED |
| `start_build` | Create new build | ✅ YES (lines 689-722) | 🟢 GOOD |
| `check_process` | Check port/process | ✅ YES (lines 725-784) | 🟢 GOOD |
| `get_preview_url` | Get app URL | ✅ YES (lines 787-833) | 🟢 GOOD |

#### Detailed Analysis

##### ✅ bash Tool (Lines 36-53, 279-310)

**Purpose**: Execute bash commands in Daytona workspace

**Implementation**:
```typescript
private async executeBashInWorkspace(
  command: string,
  workspaceId: bigint,
  timeout: number
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const { daytonaManager } = await import('../workspace/daytona-manager.js');
  const workspace = await daytonaManager.getWorkspace(workspaceId);

  const sandbox = await daytona.get(workspace.daytona_sandbox_id);

  const process = await sandbox.process.start({
    id: `terminal-cmd-${Date.now()}`,
    cmd: ['/bin/sh', '-c', command],
    cwd: '/workspace',
    onStdout: (data: Uint8Array) => { stdout += ... },
    onStderr: (data: Uint8Array) => { stderr += ... }
  });

  await process.wait();
  return { stdout, stderr, exitCode };
}
```

**Strengths**:
- ✅ Properly integrates with Daytona SDK
- ✅ Captures stdout and stderr
- ✅ Returns exit code
- ✅ Has timeout protection (default: 30s)

**Weaknesses**:
- 🔴 Creates new process for every command (no persistent shell)
- 🔴 No environment variable persistence between commands
- 🔴 Timeout not configurable from Claude (hardcoded in tool definition)

##### 🟡 build_status Tool (Lines 625-686)

**Purpose**: Get latest build status and logs

**Strengths**:
- ✅ Integrates with build-manager
- ✅ Shows recent events
- ✅ Can retrieve full logs with `show_logs: true`
- ✅ Returns comprehensive build metadata

**Weaknesses**:
- 🔴 **NO BUILD PHASE DETAILS**: Doesn't show which step failed (install vs build vs deploy)
- 🔴 **LIMITED LOG PREVIEW**: Only shows 500 chars of logs (lines 658-660)
- 🔴 **NO ERROR EXTRACTION**: Doesn't parse/highlight actual error messages
- 🔴 **NO SUGGESTED FIXES**: Just returns raw data, no diagnosis

**Current Output Example**:
```json
{
  "found": true,
  "build_id": "123",
  "status": "failed",
  "phase": "build",
  "error_message": "Build failed",
  "recent_events": ["[log] setup: Daytona session created", ...],
  "logs": {
    "install": "npm install...(truncated at 500 chars)",
    "build": "npm run build...(truncated at 500 chars)"
  }
}
```

**SHOULD Return**:
```json
{
  "found": true,
  "status": "failed",
  "failed_at_phase": "build",
  "failed_at_step": "Running build command: npm run build",
  "parsed_errors": [
    {
      "type": "typescript_error",
      "file": "src/components/Header.tsx",
      "line": 42,
      "message": "Property 'title' does not exist on type 'Props'"
    }
  ],
  "full_error_context": "...(last 50 lines before failure)",
  "suggested_actions": [
    "Check TypeScript types in src/components/Header.tsx:42",
    "Verify Props interface includes 'title' property"
  ]
}
```

##### 🟢 check_process Tool (Lines 725-784)

**Purpose**: Check if port or process is running

**Strengths**:
- ✅ Checks workspace status first
- ✅ Uses both `lsof` and `netstat` for port detection
- ✅ Can search for processes by name
- ✅ Returns detailed output

**Usage Example**:
```json
// Check if dev server is running
{
  "port": 3000
}

// Returns:
{
  "workspace_running": true,
  "port": {
    "port": 3000,
    "in_use": true,
    "details": "node    12345  user   21u  IPv4  0t0  TCP *:3000 (LISTEN)"
  }
}
```

---

### Missing Critical Tools 🔴

#### 1. `get_dev_server_logs`
**Purpose**: Retrieve recent dev server output

**Why Critical**: Dev servers crash with errors in stdout/stderr, not in build logs

**Proposed Implementation**:
```typescript
{
  name: "get_dev_server_logs",
  description: "Get recent output from the running dev server. Shows last N lines of stdout/stderr.",
  input_schema: {
    type: "object",
    properties: {
      lines: {
        type: "number",
        description: "Number of recent lines to retrieve (default: 100)",
        default: 100
      }
    }
  }
}

// Handler reads from /tmp/dev-server.log or PTY output buffer
```

#### 2. `get_build_errors`
**Purpose**: Parse and extract specific errors from build logs

**Why Critical**: Agent needs structured error data, not raw log dumps

**Proposed Implementation**:
```typescript
{
  name: "get_build_errors",
  description: "Parse build logs and extract structured error information including file locations, line numbers, and error types.",
  input_schema: {
    type: "object",
    properties: {
      build_id: {
        type: "string",
        description: "Specific build ID (optional - defaults to latest)"
      }
    }
  }
}

// Returns structured error data with regex parsing
```

#### 3. `restart_dev_server`
**Purpose**: Kill and restart dev server

**Why Critical**: Common fix for many issues (stale cache, port conflicts, etc.)

**Proposed Implementation**:
```typescript
{
  name: "restart_dev_server",
  description: "Restart the development server. Kills existing processes and starts fresh.",
  input_schema: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "Dev server command (optional - auto-detects if not provided)"
      }
    }
  }
}

// Handler calls daytonaManager.restartDevServer()
```

#### 4. `get_sandbox_state`
**Purpose**: Get comprehensive sandbox status

**Why Critical**: Agent needs full context before diagnosing issues

**Proposed Implementation**:
```typescript
{
  name: "get_sandbox_state",
  description: "Get complete Daytona sandbox state including status, running processes, tech stack, and resource usage.",
  input_schema: {
    type: "object",
    properties: {}
  }
}

// Returns:
// {
//   sandbox_id: "...",
//   status: "running",
//   tech_stack: { language: "nodejs", framework: "nextjs" },
//   dev_server: {
//     running: true,
//     port: 3000,
//     pid: 12345,
//     uptime_seconds: 120
//   },
//   latest_build: {
//     id: "123",
//     status: "failed",
//     phase: "build"
//   },
//   resource_usage: { cpu: "5%", memory: "256MB" }
// }
```

#### 5. `get_sandbox_env`
**Purpose**: View environment variables in sandbox

**Why Critical**: Many issues caused by missing env vars

**Proposed Implementation**:
```typescript
{
  name: "get_sandbox_env",
  description: "Get environment variables configured in the Daytona sandbox.",
  input_schema: {
    type: "object",
    properties: {
      filter: {
        type: "string",
        description: "Filter env vars by name pattern (optional)"
      }
    }
  }
}
```

#### 6. `deploy_files_to_sandbox`
**Purpose**: Re-deploy specific files from VFS to sandbox

**Why Critical**: File changes in VFS don't auto-sync to sandbox

**Proposed Implementation**:
```typescript
{
  name: "deploy_files_to_sandbox",
  description: "Deploy specific files from VFS to Daytona sandbox. Useful when code changes need to be applied to running environment.",
  input_schema: {
    type: "object",
    properties: {
      paths: {
        type: "array",
        items: { type: "string" },
        description: "File paths to deploy (deploys all if not specified)"
      }
    }
  }
}
```

---

## Part 3: Automatic Error Forwarding

### Current State: 🔴 **DOES NOT EXIST**

#### How Errors Flow Today (Manual Only)

```
┌─────────────────────────────────────────────────────────┐
│ 1. Build fails in Daytona sandbox                      │
│    - Captured in build-manager.ts                      │
│    - Stored in database (builds table)                 │
│    - Logged to build_events table                      │
└──────────────────────────────────────────┬──────────────┘
                                          │
                                          │ ❌ NO FORWARDING
                                          │
┌─────────────────────────────────────────▼──────────────┐
│ 2. User manually opens terminal agent                  │
│    - Types: "Why did my build fail?"                   │
└──────────────────────────────┬──────────────────────────┘
                              │
┌─────────────────────────────▼──────────────────────────┐
│ 3. Terminal agent uses build_status tool               │
│    - Retrieves error from database                     │
│    - Returns to user                                   │
└─────────────────────────────────────────────────────────┘
```

#### How Errors SHOULD Flow (Automatic + Proactive)

```
┌─────────────────────────────────────────────────────────┐
│ 1. Build fails in Daytona sandbox                      │
│    - build-manager.ts detects failure                  │
│    - Extracts error details                            │
└──────────────────────────────────────────┬──────────────┘
                                          │
                              ✅ AUTOMATIC FORWARDING
                                          │
┌─────────────────────────────────────────▼──────────────┐
│ 2. Error posted to context-manager                     │
│    - contextManager.upsertContextItem(                 │
│        projectId, 'error', 'build_123',                │
│        errorDetails, { autoForwarded: true }           │
│      )                                                 │
│    - Error visible to ALL agents for this project     │
└──────────────────────────────────────────┬─────────────┘
                                          │
              ✅ PROACTIVE AGENT NOTIFICATION (NEW)
                                          │
┌─────────────────────────────────────────▼──────────────┐
│ 3. Terminal agent auto-creates session                 │
│    - Agent proactively analyzes error                  │
│    - Uses tools to diagnose root cause                 │
│    - Prepares suggested fixes                          │
└──────────────────────────────────────────┬─────────────┘
                                          │
                           ✅ USER NOTIFICATION
                                          │
┌─────────────────────────────────────────▼──────────────┐
│ 4. Frontend shows error notification                   │
│    - "Build failed. Terminal agent investigated..."    │
│    - Shows agent's diagnosis and suggested fixes       │
│    - User can open chat to see full analysis           │
└─────────────────────────────────────────────────────────┘
```

---

### Implementation Gaps

#### Gap 1: No Error Forwarding from build-manager 🔴

**Current Code** (`workspace/build-manager.ts`):

```typescript
// Lines 336-340: Errors are logged but NOT forwarded
(chunk: string) => {
  stderrBuffer += chunk;
  console.log(`[BUILD ${buildId}] [STDERR]`, chunk);

  // Log errors as build events
  this.addBuildEvent(buildId, 'error', undefined, chunk).catch(err =>
    console.error(`Failed to add error event:`, err)
  );
}
```

**MISSING**: Integration with context-manager

**SHOULD BE**:
```typescript
// Import context-manager
import { contextManager } from '../ai/context-manager.js';

// In error callback:
(chunk: string) => {
  stderrBuffer += chunk;
  console.log(`[BUILD ${buildId}] [STDERR]`, chunk);

  // Log to build events
  this.addBuildEvent(buildId, 'error', undefined, chunk);

  // ✅ FORWARD TO CONTEXT MANAGER
  contextManager.upsertContextItem(
    build.project_id,
    'error',
    `build_${buildId}_error`,
    chunk,
    {
      buildId: buildId.toString(),
      phase: build.phase,
      timestamp: new Date().toISOString(),
      autoForwarded: true
    }
  ).catch(err => console.error(`Failed to forward error:`, err));
}
```

#### Gap 2: No Dev Server Error Monitoring 🔴

**Current Code** (`workspace/daytona-manager.ts` lines 1268-1278):

```typescript
// PTY output is captured but NOT analyzed for errors
pty = await sandbox.process.createPty({
  id: `dev-server-${workspaceId}`,
  cols: 120,
  rows: 30,
  onData: (data: Uint8Array) => {
    const text = new TextDecoder().decode(data);
    outputBuffer += text;
    console.log(`[DAYTONA PTY]`, text); // ❌ Just logging, not forwarding
  }
});
```

**SHOULD INCLUDE**:
```typescript
onData: (data: Uint8Array) => {
  const text = new TextDecoder().decode(data);
  outputBuffer += text;
  console.log(`[DAYTONA PTY]`, text);

  // ✅ DETECT AND FORWARD ERRORS
  if (this.isErrorOutput(text)) {
    this.forwardDevServerError(workspaceId, projectId, text);
  }
}

// Helper method
private isErrorOutput(text: string): boolean {
  const errorPatterns = [
    /error:/i,
    /failed to compile/i,
    /module not found/i,
    /cannot find module/i,
    /syntaxerror/i,
    /typeerror/i,
    /referenceerror/i,
    /uncaught/i,
    /unhandled/i
  ];

  return errorPatterns.some(pattern => pattern.test(text));
}

private async forwardDevServerError(
  workspaceId: bigint,
  projectId: bigint,
  errorText: string
): Promise<void> {
  const { contextManager } = await import('../ai/context-manager.js');

  await contextManager.upsertContextItem(
    projectId,
    'error',
    `devserver_${workspaceId}_${Date.now()}`,
    errorText,
    {
      workspaceId: workspaceId.toString(),
      source: 'dev_server',
      timestamp: new Date().toISOString(),
      autoForwarded: true
    }
  );
}
```

#### Gap 3: No Proactive Agent Triggering 🔴

**Currently Missing Entirely**

**Proposed New File**: `/home/ssitzer/projects/vaporform/ai/error-forwarder.ts`

```typescript
/**
 * Error Forwarder - Automatic error detection and terminal agent triggering
 * Monitors context-manager for new errors and proactively engages terminal agent
 */

import { contextManager } from './context-manager.js';
import { terminalAgentTools } from './terminal-agent-tools.js';

export class ErrorForwarder {
  /**
   * Watch for new errors and trigger terminal agent
   */
  async watchErrors(projectId: bigint): Promise<void> {
    // Poll context-manager for new errors every 5 seconds
    setInterval(async () => {
      const crossContext = await contextManager.getCrossAgentContext(projectId);

      // Check for unprocessed errors
      const newErrors = crossContext.sharedErrors.filter(err =>
        !err.metadata?.processedByTerminalAgent
      );

      if (newErrors.length > 0) {
        console.log(`[Error Forwarder] Found ${newErrors.length} new errors for project ${projectId}`);

        for (const error of newErrors) {
          await this.triggerTerminalAgent(projectId, error);
        }
      }
    }, 5000);
  }

  /**
   * Trigger terminal agent to analyze error
   */
  private async triggerTerminalAgent(
    projectId: bigint,
    error: ContextItem
  ): Promise<void> {
    console.log(`[Error Forwarder] Triggering terminal agent for error: ${error.item_key}`);

    // Create a background session for the agent
    const session = await contextManager.createSession(
      projectId,
      'system', // System user for auto-triggered sessions
      'terminal',
      `Auto-investigation: ${error.item_key}`,
      { autoTriggered: true, errorId: error.id.toString() }
    );

    // Prepare analysis prompt
    const prompt = `An error was automatically detected in the project:

Error Type: ${error.item_type}
Error Key: ${error.item_key}
Error Content:
${error.content}

Metadata: ${JSON.stringify(error.metadata, null, 2)}

Please:
1. Use available tools to investigate the root cause
2. Check relevant logs (build logs, dev server logs)
3. Identify the specific files/lines causing the issue
4. Suggest concrete fixes

Begin your investigation now.`;

    // Execute terminal agent analysis
    // (This would integrate with terminal-agent-api.ts)

    // Mark error as processed
    await contextManager.upsertContextItem(
      projectId,
      error.item_type,
      error.item_key,
      error.content,
      {
        ...error.metadata,
        processedByTerminalAgent: true,
        processedAt: new Date().toISOString(),
        sessionId: session.id.toString()
      }
    );
  }
}

export const errorForwarder = new ErrorForwarder();
```

---

## Part 4: System Prompt Analysis

### Current System Prompt (Lines 420-492)

**Strengths** ✅:
- Clear role definition: "AI-powered terminal assistant"
- Lists all available tools
- Includes cross-agent context
- Shows recent code activity, errors, files
- Provides guidelines for behavior

**Weaknesses** 🔴:
- No Daytona sandbox status information
- No mention of build system capabilities
- Doesn't emphasize proactive error diagnosis
- Missing guidance on common debugging workflows

### Recommended Enhanced Prompt

```typescript
return `You are an AI-powered terminal assistant integrated into Vaporform, a cloud-based development platform.

# Your Primary Mission

You are the DEBUGGING SPECIALIST for Daytona sandbox environments. Your job is to:
1. **Proactively diagnose** build failures, dev server crashes, and runtime errors
2. **Investigate automatically** when errors are forwarded from the build system
3. **Provide actionable fixes** with specific file paths and line numbers
4. **Use your tools extensively** to gather evidence before making conclusions

# Current Sandbox State

- Project ID: ${projectId}
- Workspace ID: ${workspaceId || 'N/A'}
- Sandbox ID: ${workspace?.daytona_sandbox_id || 'Not provisioned'}
- Sandbox Status: ${workspace?.status || 'Unknown'}
- Tech Stack: ${techStack?.language}/${techStack?.framework} (${techStack?.packageManager})

## Latest Build Status
${latestBuild ? `
- Build ID: ${latestBuild.id}
- Status: ${latestBuild.status}
- Phase: ${latestBuild.phase}
- ${latestBuild.error_message ? `Error: ${latestBuild.error_message}` : 'No errors'}
` : 'No builds yet'}

## Dev Server Status
${devServerStatus ? `
- Running: ${devServerStatus.running ? 'YES' : 'NO'}
- Port: ${devServerStatus.port || 'Unknown'}
- Uptime: ${devServerStatus.uptime || 'N/A'}
` : 'Not detected'}

# Your Capabilities

You have access to powerful tools for terminal operations, file management, and Daytona sandbox debugging:

## File Operations
1. **read_file** - Read file contents from VFS
2. **write_file** - Write content to files
3. **edit_file** - Make targeted edits
4. **glob** - Find files by pattern
5. **grep** - Search file contents
6. **ls** - List directory contents

## Sandbox Operations
7. **bash** - Execute bash commands in Daytona sandbox
8. **check_process** - Check if process/port is running
9. **get_sandbox_state** - Get comprehensive sandbox status
10. **get_sandbox_env** - View environment variables

## Build & Deploy Operations
11. **build_status** - Get detailed build information with logs
12. **start_build** - Trigger a new build
13. **get_build_errors** - Parse and extract structured error data
14. **deploy_files_to_sandbox** - Deploy VFS files to sandbox

## Dev Server Operations
15. **get_dev_server_logs** - Retrieve recent dev server output
16. **restart_dev_server** - Kill and restart dev server
17. **get_preview_url** - Get application preview URL

# Cross-Agent Context Awareness

You share context with the code generation agent. Here's what else is happening:

## Recent Code Generation Activity
${crossContext.recentCodeActivity.length > 0 ? crossContext.recentCodeActivity.slice(0, 5).map(msg =>
  `- [${msg.created_at.toISOString()}] ${msg.role}: ${msg.content.substring(0, 200)}${msg.content.length > 200 ? '...' : ''}`
).join('\n') : 'No recent code generation activity'}

## Recent Errors (⚠️ INVESTIGATE THESE)
${crossContext.sharedErrors.length > 0 ? crossContext.sharedErrors.slice(0, 3).map(err =>
  `- ${err.item_key}: ${err.content.substring(0, 150)}`
).join('\n') : 'No recent errors'}

## Active Jobs
${crossContext.activeJobs.length > 0 ? crossContext.activeJobs.map(job =>
  `- ${job.job_type}: ${job.description || 'N/A'} (${job.status}, ${job.progress_percentage}%)`
).join('\n') : 'No active jobs'}

# Debugging Workflow Guidelines

When investigating errors, follow this systematic approach:

1. **Gather Context First**
   - Use \`get_sandbox_state\` to understand current environment
   - Use \`build_status\` to see if build failed
   - Use \`check_process\` to verify dev server status

2. **Retrieve Logs**
   - Use \`get_build_errors\` for structured error data
   - Use \`get_dev_server_logs\` for runtime errors
   - Use \`bash\` to check system logs if needed

3. **Investigate Files**
   - Use \`grep\` to search for error patterns
   - Use \`read_file\` to examine problematic files
   - Check for common issues (missing deps, syntax errors, type errors)

4. **Propose Fixes**
   - Provide specific file paths and line numbers
   - Show exact code changes needed
   - Explain WHY the fix works
   - Consider side effects

5. **Verify Fix**
   - Use \`write_file\` or \`edit_file\` to apply changes
   - Use \`deploy_files_to_sandbox\` to sync to sandbox
   - Use \`restart_dev_server\` if needed
   - Use \`check_process\` to verify server is running

# Common Error Patterns

## TypeScript Errors
- Check tsconfig.json for strict settings
- Verify type definitions are installed
- Look for missing/incorrect imports

## Module Not Found
- Check package.json for dependencies
- Verify node_modules exists (may need npm install)
- Check import paths for typos

## Port Already in Use
- Use \`check_process\` to find conflicting process
- Use \`bash\` with \`kill\` to stop old processes
- Use \`restart_dev_server\` to clean start

## Build Failures
- Check for syntax errors first
- Verify all dependencies installed
- Look for environment variable issues

# Response Style

- Be **proactive**: Use tools before asking user for info
- Be **specific**: Provide file paths, line numbers, exact commands
- Be **thorough**: Check all common causes before concluding
- Be **educational**: Explain the root cause, not just the fix
- Be **efficient**: Use the right tool for the job

You are a professional, highly competent debugging specialist with full awareness of the Daytona sandbox environment and build system.`;
```

---

## Part 5: Recommendations & Implementation Plan

### Priority 1: Enable Automatic Error Forwarding (CRITICAL) 🔴

**Estimated Effort**: 4-6 hours

#### Step 1: Update build-manager.ts
**File**: `workspace/build-manager.ts`

**Changes**:
```typescript
// Add at top
import { contextManager } from '../ai/context-manager.js';

// In runBuildCommand method, error callback (line 336):
onStderr: (chunk: string) => {
  stderrBuffer += chunk;
  console.log(`[BUILD ${buildId}] [STDERR]`, chunk);

  // Existing: Add build event
  this.addBuildEvent(buildId, 'error', undefined, chunk);

  // NEW: Forward to context manager
  this.forwardBuildError(buildId, build.project_id, chunk);
}

// Add new method:
private async forwardBuildError(
  buildId: bigint,
  projectId: bigint,
  errorText: string
): Promise<void> {
  try {
    await contextManager.upsertContextItem(
      projectId,
      'error',
      `build_${buildId}_error_${Date.now()}`,
      errorText,
      {
        buildId: buildId.toString(),
        source: 'build',
        timestamp: new Date().toISOString(),
        autoForwarded: true
      }
    );
  } catch (err) {
    console.error(`Failed to forward build error:`, err);
  }
}
```

#### Step 2: Update daytona-manager.ts for Dev Server Errors
**File**: `workspace/daytona-manager.ts`

**Changes**:
```typescript
// In startDevServer, PTY onData callback (line 1274):
onData: (data: Uint8Array) => {
  const text = new TextDecoder().decode(data);
  outputBuffer += text;
  console.log(`[DAYTONA PTY]`, text);

  // NEW: Detect and forward errors
  if (this.isErrorOutput(text)) {
    this.forwardDevServerError(workspaceId, projectId, text);
  }
}

// Add helper methods:
private isErrorOutput(text: string): boolean {
  const errorPatterns = [
    /error:/i,
    /failed to compile/i,
    /module not found/i,
    /cannot find module/i,
    /syntaxerror/i,
    /typeerror/i,
    /referenceerror/i
  ];
  return errorPatterns.some(p => p.test(text));
}

private async forwardDevServerError(
  workspaceId: bigint,
  projectId: bigint,
  errorText: string
): Promise<void> {
  const { contextManager } = await import('../ai/context-manager.js');

  await contextManager.upsertContextItem(
    projectId,
    'error',
    `devserver_${workspaceId}_${Date.now()}`,
    errorText,
    {
      workspaceId: workspaceId.toString(),
      source: 'dev_server',
      autoForwarded: true
    }
  );
}
```

#### Step 3: Create error-forwarder.ts (NEW FILE)
**File**: `ai/error-forwarder.ts`

**(See full implementation in Part 3, Gap 3 above)**

---

### Priority 2: Add Missing Daytona Tools (HIGH) 🟡

**Estimated Effort**: 6-8 hours

#### New Tools to Add

1. **get_build_errors** - Parse and extract structured errors
2. **get_dev_server_logs** - Retrieve recent dev server output
3. **restart_dev_server** - Kill and restart dev server
4. **get_sandbox_state** - Get comprehensive sandbox status
5. **get_sandbox_env** - View environment variables
6. **deploy_files_to_sandbox** - Re-deploy specific files

**Implementation**:
- Add tool definitions to `terminal-agent-tools.ts` `getToolDefinitions()`
- Add handlers to `executeTool()` switch statement
- Create handler methods (see detailed specs in Part 2)

---

### Priority 3: Enhance System Prompt (MEDIUM) 🟡

**Estimated Effort**: 2 hours

**Changes to** `buildTerminalAgentPrompt()` **in** `terminal-agent-api.ts`:

1. Fetch workspace status before building prompt
2. Fetch latest build status
3. Detect dev server status
4. Include all in prompt (see enhanced prompt in Part 4)
5. Add debugging workflow guidelines
6. Add common error patterns reference

---

### Priority 4: Implement Proactive Error Investigation (MEDIUM) 🟡

**Estimated Effort**: 8-10 hours

**Components**:
1. Error forwarder service (error-forwarder.ts)
2. Background error watcher
3. Auto-triggered terminal agent sessions
4. Frontend notification system for auto-investigations

---

## Summary of Critical Gaps

| Gap | Severity | Impact | Estimated Fix Time |
|-----|----------|--------|-------------------|
| No automatic error forwarding | 🔴 CRITICAL | Terminal agent is reactive instead of proactive | 4-6 hours |
| Missing Daytona-specific tools | 🟡 HIGH | Limited debugging capabilities | 6-8 hours |
| Limited build error parsing | 🟡 HIGH | Agent gets raw logs, not structured errors | 3-4 hours |
| No dev server log access | 🟡 HIGH | Can't diagnose runtime errors | 2-3 hours |
| Weak sandbox state awareness | 🟡 MEDIUM | Lacks context for diagnosis | 2 hours |
| No proactive investigation | 🟡 MEDIUM | User must manually ask for help | 8-10 hours |

**Total Estimated Effort**: 25-33 hours of focused development

---

## Conclusion

The terminal agent has a **solid foundation** with good cross-agent context awareness and basic tool capabilities. However, it is **critically missing automatic error forwarding** and **Daytona-specific debugging tools** needed to fulfill its role as a sandbox debugging specialist.

The agent currently operates in **reactive mode** (user asks → agent investigates) instead of **proactive mode** (errors occur → agent auto-diagnoses). Implementing automatic error forwarding from build-manager.ts and daytona-manager.ts to the context-manager, combined with a proactive error forwarder service, would transform the terminal agent into a truly autonomous debugging assistant.

### Recommended Implementation Order

1. **Week 1**: Priority 1 - Automatic error forwarding (CRITICAL)
2. **Week 2**: Priority 2 - Add missing Daytona tools (HIGH)
3. **Week 3**: Priority 3 - Enhance system prompt (MEDIUM)
4. **Week 4**: Priority 4 - Proactive error investigation (MEDIUM)

This implementation plan will transform the terminal agent from a reactive helper into a proactive debugging specialist that automatically catches, investigates, and suggests fixes for errors in the Daytona sandbox environment.
