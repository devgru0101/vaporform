'use client';

import { RawTerminalMode } from './RawTerminalMode';

interface TerminalProps {
  projectId: string;
  workspaceId: string;
}

export function Terminal({ projectId, workspaceId }: TerminalProps) {
  return (
    <RawTerminalMode
      workspaceId={workspaceId}
      projectId={projectId}
    />
  );
}
