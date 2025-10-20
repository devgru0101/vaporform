# Vaporform Frontend

Next.js frontend for the Vaporform agentic development environment.

## Features

- Monaco Editor - Full VS Code editing experience
- File Explorer - VFS integration with tree view
- AI Chat Panel - KiloCode assistant with streaming
- Split View - Editor and preview side-by-side
- Git Timeline - Visual commit history
- WebSocket Terminal - Full terminal access
- UI Edit Mode - Click components for AI context
- Brutalist UI - Black/white with neon accents

## Tech Stack

- Next.js 15 (App Router, Turbopack)
- Clerk Authentication
- Tailwind CSS
- Monaco Editor
- xterm.js Terminal
- TanStack Query

## Getting Started

### Prerequisites

- Node.js 20+
- Vaporform backend at `http://127.0.0.1:4000`
- Clerk account

### Installation

```bash
npm install
```

### Environment

Create `.env.local`:

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_API_URL=http://127.0.0.1:4000
NEXT_PUBLIC_WS_URL=ws://127.0.0.1:4001
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Architecture

- **REST API**: File operations, projects, Git
- **Server-Sent Events**: AI chat streaming
- **WebSocket**: Terminal sessions

## Design System

- **Colors**: Black (#000), White (#FFF), Neon Green (#00FF41), Neon Blue (#00D9FF)
- **Fonts**: Inter (sans), JetBrains Mono (code)
- **Style**: Brutalist (thick borders, sharp corners, high contrast)
