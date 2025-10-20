# Terminal Agent Integration Guide

This document provides instructions for integrating the terminal agent into the Vaporform frontend.

## Overview

The terminal agent is now fully implemented in the backend with OpenCode-style tools and cross-agent context awareness. This guide explains how to integrate it with the frontend terminal UI.

## Backend APIs

### 1. Terminal Agent Chat API

**Endpoint**: `POST /ai/terminal-agent/chat`

**Purpose**: Send messages to the AI-powered terminal agent

**Request**:
```typescript
interface TerminalAgentRequest {
  authorization: string;
  projectId: bigint;
  sessionId?: bigint; // Optional: reuse existing session
  message: string;
  workspaceId?: bigint; // For executing commands in Daytona workspace
}
```

**Response**:
```typescript
interface TerminalAgentResponse {
  sessionId: bigint;
  response: string;
  toolsUsed: Array<{
    name: string;
    input: any;
    output: any;
    status: 'success' | 'error';
  }>;
  context: {
    filesAccessed: string[];
    commandsRun: string[];
    errorsEncountered: string[];
  };
}
```

### 2. Batch Indexing API

**Endpoint**: `POST /ai/index/batch`

**Purpose**: Index all files in a project for RAG search

**Request**:
```typescript
interface BatchIndexRequest {
  authorization: string;
  projectId: bigint;
}
```

**Response**:
```typescript
interface BatchIndexResponse {
  success: boolean;
  projectId: bigint;
  filesIndexed: number;
  filesSkipped: number;
  chunksCreated: number;
  errors: string[];
  duration: number;
}
```

### 3. Index Status API

**Endpoint**: `GET /ai/index/status/:projectId`

**Purpose**: Check RAG indexing status for a project

### 4. Clear Index API

**Endpoint**: `DELETE /ai/index/clear/:projectId`

**Purpose**: Clear all indexed data for a project

## Frontend Integration Steps

### Step 1: Add Terminal AI Mode Toggle

Add a toggle to the terminal UI that enables/disables AI mode:

```typescript
// In terminal component
const [aiMode, setAiMode] = useState(false);
const [agentSessionId, setAgentSessionId] = useState<bigint | null>(null);
```

### Step 2: Intercept Terminal Input

When AI mode is enabled, intercept user input and send to the terminal agent instead of the PTY:

```typescript
const handleTerminalInput = async (input: string) => {
  if (aiMode) {
    // Send to AI agent
    const response = await fetch('/api/ai/terminal-agent/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        projectId,
        sessionId: agentSessionId,
        message: input,
        workspaceId
      })
    });

    const data = await response.json();

    // Update session ID for context continuity
    setAgentSessionId(data.sessionId);

    // Display response in terminal
    displayAgentResponse(data);
  } else {
    // Send to PTY as normal
    sendToPty(input);
  }
};
```

### Step 3: Display Agent Responses

Create a function to nicely format and display agent responses:

```typescript
const displayAgentResponse = (data: TerminalAgentResponse) => {
  // Show AI response
  writeToTerminal(`\x1b[36m[AI Assistant]\x1b[0m ${data.response}\n`);

  // Show tools used (optional, for debugging)
  if (data.toolsUsed.length > 0) {
    writeToTerminal(`\x1b[90m[Tools used: ${data.toolsUsed.map(t => t.name).join(', ')}]\x1b[0m\n`);
  }

  // Show files accessed (optional)
  if (data.context.filesAccessed.length > 0) {
    writeToTerminal(`\x1b[90m[Files: ${data.context.filesAccessed.join(', ')}]\x1b[0m\n`);
  }

  // Show commands run
  if (data.context.commandsRun.length > 0) {
    writeToTerminal(`\x1b[90m[Commands: ${data.context.commandsRun.join('; ')}]\x1b[0m\n`);
  }
};
```

### Step 4: Add UI Indicators

Add visual indicators to show when AI mode is active:

```tsx
<div className="terminal-header">
  <button
    onClick={() => setAiMode(!aiMode)}
    className={aiMode ? 'ai-mode-active' : 'ai-mode-inactive'}
  >
    {aiMode ? '🤖 AI Mode' : '💻 Normal Mode'}
  </button>

  {aiMode && (
    <span className="ai-indicator">
      AI Assistant is active
    </span>
  )}
</div>
```

### Step 5: Handle Tool Execution Progress

For long-running tool executions, show progress indicators:

```typescript
const [isAgentThinking, setIsAgentThinking] = useState(false);

const handleTerminalInput = async (input: string) => {
  if (aiMode) {
    setIsAgentThinking(true);
    writeToTerminal(`\x1b[36m[AI is thinking...]\x1b[0m\n`);

    try {
      const response = await fetch('/api/ai/terminal-agent/chat', {
        // ... request details
      });

      const data = await response.json();
      displayAgentResponse(data);
    } finally {
      setIsAgentThinking(false);
    }
  }
};
```

## Example Usage Flows

### Example 1: Debugging an Error

```
User: "I'm getting a TypeScript error in src/components/Button.tsx, can you help?"

AI Agent:
1. Uses read_file to read Button.tsx
2. Identifies the error
3. Uses edit_file to fix it
4. Responds with explanation of fix

Response: "I found the issue - you were using the wrong import path. I've fixed it by changing line 3 from './types' to '../types'. The file has been updated."
```

### Example 2: Running Tests

```
User: "Run the tests and tell me what failed"

AI Agent:
1. Uses bash to run `npm test`
2. Analyzes the output
3. Uses read_file to check failing test file
4. Provides analysis

Response: "I ran the tests and found 2 failures in auth.test.ts. The issue is that the mock user is missing the 'email' property. Here's the output: [test output]"
```

### Example 3: Finding Files

```
User: "Find all TypeScript files that import from 'react-query'"

AI Agent:
1. Uses grep to search for 'react-query' imports
2. Returns list of matching files

Response: "I found 12 files importing from 'react-query':
- src/hooks/useProjects.ts
- src/hooks/useWorkspaces.ts
- [... full list]"
```

## Context Awareness Features

The terminal agent has access to:

1. **Recent Code Generation Activity**: Can see what the code generation agent just did
2. **Recently Modified Files**: Aware of files that were just changed
3. **Active Jobs**: Knows about ongoing code generation jobs
4. **Recent Errors**: Can reference errors from the code agent
5. **RAG Code Search**: Has semantic search across entire codebase

## Best Practices

### 1. Index Projects on Load

When a user opens a project for the first time, trigger batch indexing:

```typescript
useEffect(() => {
  if (project && !project.indexed) {
    fetch(`/api/ai/index/batch`, {
      method: 'POST',
      body: JSON.stringify({ projectId: project.id })
    });
  }
}, [project]);
```

### 2. Show Indexing Status

Display indexing progress in the UI:

```typescript
const { data: indexStatus } = useQuery(
  ['index-status', projectId],
  () => fetch(`/api/ai/index/status/${projectId}`).then(r => r.json())
);

// Show in UI:
// "Indexed: 45 files, 234 code chunks"
```

### 3. Clear Cache When Needed

Provide a way for users to clear and re-index:

```tsx
<button onClick={() => clearAndReindex()}>
  Re-index Project
</button>
```

### 4. Handle Errors Gracefully

Show user-friendly error messages:

```typescript
try {
  const response = await fetch('/api/ai/terminal-agent/chat', ...);
  if (!response.ok) {
    throw new Error('Agent request failed');
  }
} catch (error) {
  writeToTerminal(`\x1b[31m[Error: AI agent unavailable]\x1b[0m\n`);
  // Fall back to normal terminal mode
  setAiMode(false);
}
```

## Testing

### Manual Testing Checklist

- [ ] AI mode toggle works
- [ ] Agent receives user messages
- [ ] Agent responses are displayed correctly
- [ ] File operations (read/write/edit) work
- [ ] Bash commands execute properly
- [ ] Context is maintained across messages in a session
- [ ] Session can be resumed
- [ ] Batch indexing completes successfully
- [ ] RAG results appear in agent responses
- [ ] Cross-agent context is available (check by referencing recent code changes)

### Example Test Scenarios

1. **Simple Command**:
   - Input: "What files are in the src directory?"
   - Expected: Uses `ls` tool, returns file list

2. **File Reading**:
   - Input: "Show me the contents of package.json"
   - Expected: Uses `read_file`, displays content

3. **Code Search**:
   - Input: "Where is the authentication logic?"
   - Expected: Uses `grep` or RAG search, finds relevant files

4. **File Editing**:
   - Input: "Change the app title to 'My App' in config.ts"
   - Expected: Uses `read_file` then `edit_file`, confirms change

5. **Context Awareness**:
   - First: Use code generation agent to create a component
   - Then: Ask terminal agent "What did the code agent just create?"
   - Expected: Terminal agent should know about the recent code generation

## Technical Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend Terminal UI                      │
│  ┌─────────────┐         ┌────────────────────────────┐    │
│  │ AI Mode     │────────▶│ Terminal Agent API         │    │
│  │ Toggle      │         │ /ai/terminal-agent/chat    │    │
│  └─────────────┘         └────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────┐
│                    Terminal Agent (Backend)                  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Context Manager (Unified Sessions)                    │  │
│  │  - Shares context with code generation agent         │  │
│  │  - Tracks files, commands, errors                    │  │
│  │  - Maintains conversation history                    │  │
│  └──────────────────────────────────────────────────────┘  │
│                           │                                  │
│                           ▼                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Claude AI (claude-sonnet-4-5)                        │  │
│  │  - Receives cross-agent context                      │  │
│  │  - Receives RAG code search results                  │  │
│  │  - Executes tools as needed                          │  │
│  └──────────────────────────────────────────────────────┘  │
│                           │                                  │
│                           ▼                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Terminal Tools (OpenCode-style)                      │  │
│  │  - bash: Execute commands                            │  │
│  │  - read_file: Read from VFS                          │  │
│  │  - write_file: Write to VFS                          │  │
│  │  - edit_file: Targeted edits                         │  │
│  │  - glob: Find files by pattern                       │  │
│  │  - grep: Search file contents                        │  │
│  │  - ls: List directories                              │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│                     Infrastructure                            │
│  ┌─────────────┐  ┌────────────┐  ┌──────────────────────┐  │
│  │ VFS         │  │ Daytona    │  │ Qdrant (RAG)         │  │
│  │ (GridFS)    │  │ Workspace  │  │ Vector Search        │  │
│  └─────────────┘  └────────────┘  └──────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

## Database Schema

The unified session management uses these tables:

- `agent_sessions`: Sessions for both code and terminal agents
- `agent_messages`: All messages with tool execution tracking
- `context_items`: Reusable context (files, terminal output, errors)
- `session_context_links`: Links context to sessions
- `agent_jobs`: Long-running job tracking

## API Examples

### Starting a New Terminal Agent Session

```typescript
const response = await fetch('/api/ai/terminal-agent/chat', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    projectId: 123,
    message: "List all JavaScript files",
    workspaceId: 456
  })
});

const data = await response.json();
// data.sessionId can be reused for follow-up messages
```

### Continuing an Existing Session

```typescript
const response = await fetch('/api/ai/terminal-agent/chat', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    projectId: 123,
    sessionId: data.sessionId, // Reuse session for context
    message: "Now show me the contents of index.js",
    workspaceId: 456
  })
});
```

### Batch Indexing

```typescript
const response = await fetch('/api/ai/index/batch', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    projectId: 123
  })
});

const result = await response.json();
console.log(`Indexed ${result.filesIndexed} files in ${result.duration}ms`);
```

## Troubleshooting

### Agent Not Responding

1. Check that `ANTHROPIC_API_KEY` is set in backend `.env`
2. Check that project is indexed (call `/ai/index/status/:projectId`)
3. Check backend logs for errors

### Tools Failing

1. Verify workspace is running (for bash commands)
2. Check file paths are absolute (start with `/`)
3. Ensure user has project permissions

### Context Not Shared

1. Verify both agents use the same `projectId`
2. Check that unified sessions table has data
3. Ensure `contextManager.getCrossAgentContext()` is being called

## Future Enhancements

Potential improvements for the future:

1. **Streaming Responses**: Stream agent responses as they're generated
2. **Tool Progress Indicators**: Show real-time progress for long-running tools
3. **Multi-Tool Execution**: Execute multiple tools in parallel
4. **Custom Tools**: Allow users to define custom tools
5. **Agent Memory**: Persistent memory across sessions
6. **Collaboration**: Multiple users working with same agent session
7. **Voice Input**: Speak commands to the terminal agent
8. **Smart Suggestions**: Proactive suggestions based on context

## Support

For questions or issues with the terminal agent integration:

1. Check backend logs: `encore run --debug`
2. Check database: `encore db shell ai`
3. Review this guide for common patterns
4. Check the CLAUDE.md file for overall architecture

---

**Last Updated**: 2025-10-15
**Version**: 1.0.0
