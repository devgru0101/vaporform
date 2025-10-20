'use client';

import { TerminalIcon } from '../icons/TerminalIcon';
import { RobotIcon } from '../icons/RobotIcon';

interface TerminalModeToggleProps {
  mode: 'raw' | 'agent';
  onModeChange: (mode: 'raw' | 'agent') => void;
  className?: string;
}

export function TerminalModeToggle({ mode, onModeChange, className = '' }: TerminalModeToggleProps) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <button
        onClick={() => onModeChange('raw')}
        className={`p-2 rounded transition-colors ${
          mode === 'raw'
            ? 'bg-blue-600 text-white'
            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
        }`}
        title="Raw Terminal Mode - Direct Daytona terminal access"
        aria-label="Raw Terminal Mode"
      >
        <TerminalIcon className="w-5 h-5" />
      </button>

      <button
        onClick={() => onModeChange('agent')}
        className={`p-2 rounded transition-colors ${
          mode === 'agent'
            ? 'bg-purple-600 text-white'
            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
        }`}
        title="AI Agent Mode - Natural language terminal commands"
        aria-label="AI Agent Mode"
      >
        <RobotIcon className="w-5 h-5" />
      </button>

      <span className="text-sm text-gray-300 font-medium">
        {mode === 'raw' ? 'Raw Terminal' : 'AI Agent'}
      </span>
    </div>
  );
}
