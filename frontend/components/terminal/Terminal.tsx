'use client';

import { useState } from 'react';
import { TerminalModeToggle } from './TerminalModeToggle';
import { RawTerminalMode } from './RawTerminalMode';
import { AgentTerminalMode } from './AgentTerminalMode';

interface TerminalProps {
  sessionId?: string; // Keep for backward compatibility, but not used in dual-mode
  projectId: string;
  workspaceId: string;
}

export function Terminal({ projectId, workspaceId }: TerminalProps) {
  const [mode, setMode] = useState<'raw' | 'agent'>('raw');

  return (
    <div className="h-full w-full flex flex-col border-2 border-white bg-black">
      {/* Header with mode toggle */}
      <div className="border-b-2 border-white px-4 py-2 flex items-center justify-between bg-gray-900">
        <h3 className="font-bold text-sm text-white uppercase tracking-wider">Terminal</h3>
        <TerminalModeToggle
          mode={mode}
          onModeChange={setMode}
        />
      </div>

      {/* Main content area - switches based on mode */}
      <div className="flex-1 overflow-hidden">
        {mode === 'raw' ? (
          <RawTerminalMode
            workspaceId={workspaceId}
            projectId={projectId}
          />
        ) : (
          <AgentTerminalMode
            projectId={projectId}
            workspaceId={workspaceId}
          />
        )}
      </div>
    </div>
  );
}
