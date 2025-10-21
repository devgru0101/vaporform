import React, { useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/cjs/styles/prism';
import { ToolResult } from './ToolResultRenderer';

interface CommandResultProps {
  toolName: string;
  result: ToolResult;
}

export const CommandResult: React.FC<CommandResultProps> = ({ toolName, result }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<'stdout' | 'stderr'>('stdout');

  const hasOutput = result.stdout || result.stderr || result.content;
  const isSuccess = result.success !== false && (result.exitCode === undefined || result.exitCode === 0);

  // Get icon based on tool type
  const getToolIcon = () => {
    switch (toolName) {
      case 'git_commit':
      case 'git_push':
        return (
          <svg className="tool-result-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9l-6 6" />
          </svg>
        );
      default:
        return (
          <svg className="tool-result-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="4 17 10 11 4 5" />
            <line x1="12" y1="19" x2="20" y2="19" />
          </svg>
        );
    }
  };

  // Format tool name for display
  const formatToolName = (name: string) => {
    return name
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  return (
    <div className={`tool-result tool-result-command ${isSuccess ? 'success' : 'error'}`}>
      {/* Header */}
      <div className="tool-result-header" onClick={() => hasOutput && setIsCollapsed(!isCollapsed)}>
        <div className="tool-result-header-left">
          {getToolIcon()}
          <span className="tool-result-title">
            {formatToolName(toolName)} {isSuccess ? 'Successful' : 'Failed'}
          </span>
        </div>
        <div className="tool-result-header-right">
          {result.exitCode !== undefined && (
            <span className={`tool-result-exit-code ${isSuccess ? 'success' : 'error'}`}>
              Exit: {result.exitCode}
            </span>
          )}
          {hasOutput && (
            <svg
              className="tool-result-collapse-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          )}
        </div>
      </div>

      {/* Output (collapsible) */}
      {!isCollapsed && hasOutput && (
        <div className="tool-result-output">
          {/* Tabs for stdout/stderr */}
          {result.stdout && result.stderr && (
            <div className="tool-result-tabs">
              <button
                className={`tool-result-tab ${activeTab === 'stdout' ? 'active' : ''}`}
                onClick={() => setActiveTab('stdout')}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 11 12 14 22 4" />
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                </svg>
                Output
              </button>
              <button
                className={`tool-result-tab ${activeTab === 'stderr' ? 'active' : ''}`}
                onClick={() => setActiveTab('stderr')}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                Errors
              </button>
            </div>
          )}

          {/* stdout or content */}
          {(activeTab === 'stdout' || !result.stderr) && (result.stdout || result.content) && (
            <div className="tool-result-stdout">
              <SyntaxHighlighter
                language="bash"
                style={vscDarkPlus}
                customStyle={{
                  margin: 0,
                  padding: '12px',
                  background: 'var(--vf-bg-secondary)',
                  fontSize: 'var(--vf-text-xs)',
                  borderRadius: '4px',
                }}
              >
                {result.stdout || result.content || ''}
              </SyntaxHighlighter>
            </div>
          )}

          {/* stderr */}
          {(activeTab === 'stderr' || (!result.stdout && !result.content)) && result.stderr && (
            <div className="tool-result-stderr">
              <SyntaxHighlighter
                language="bash"
                style={vscDarkPlus}
                customStyle={{
                  margin: 0,
                  padding: '12px',
                  background: 'rgba(220, 38, 38, 0.1)',
                  fontSize: 'var(--vf-text-xs)',
                  borderRadius: '4px',
                  border: '1px solid rgba(220, 38, 38, 0.3)',
                }}
              >
                {result.stderr}
              </SyntaxHighlighter>
            </div>
          )}
        </div>
      )}

      {/* Error message */}
      {result.error && (
        <div className="tool-result-error">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {result.error}
        </div>
      )}
    </div>
  );
};
