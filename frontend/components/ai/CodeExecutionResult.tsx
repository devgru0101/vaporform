import React, { useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/cjs/styles/prism';
import { ToolResult } from './ToolResultRenderer';

interface CodeExecutionResultProps {
  result: ToolResult;
}

export const CodeExecutionResult: React.FC<CodeExecutionResultProps> = ({ result }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showStderr, setShowStderr] = useState(false);

  const hasOutput = result.stdout || result.stderr;
  const hasCharts = result.charts && result.charts.length > 0;
  const isSuccess = result.success || result.exitCode === 0;

  return (
    <div className={`tool-result tool-result-code-execution ${isSuccess ? 'success' : 'error'}`}>
      {/* Header with collapse button */}
      <div className="tool-result-header" onClick={() => hasOutput && setIsCollapsed(!isCollapsed)}>
        <div className="tool-result-header-left">
          <svg className="tool-result-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="16 18 22 12 16 6" />
            <polyline points="8 6 2 12 8 18" />
          </svg>
          <span className="tool-result-title">
            Code Execution {isSuccess ? 'Successful' : 'Failed'}
          </span>
          {result.language && (
            <span className="tool-result-language">{result.language}</span>
          )}
        </div>
        <div className="tool-result-header-right">
          <span className={`tool-result-exit-code ${isSuccess ? 'success' : 'error'}`}>
            Exit Code: {result.exitCode ?? 0}
          </span>
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

      {/* Output section (collapsible) */}
      {!isCollapsed && hasOutput && (
        <div className="tool-result-output">
          {/* Tab buttons for stdout/stderr */}
          {result.stdout && result.stderr && (
            <div className="tool-result-tabs">
              <button
                className={`tool-result-tab ${!showStderr ? 'active' : ''}`}
                onClick={() => setShowStderr(false)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 11 12 14 22 4" />
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                </svg>
                stdout
              </button>
              <button
                className={`tool-result-tab ${showStderr ? 'active' : ''}`}
                onClick={() => setShowStderr(true)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                stderr
              </button>
            </div>
          )}

          {/* stdout */}
          {!showStderr && result.stdout && (
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
                {result.stdout}
              </SyntaxHighlighter>
            </div>
          )}

          {/* stderr */}
          {(showStderr || (!result.stdout && result.stderr)) && result.stderr && (
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

      {/* Matplotlib Charts */}
      {hasCharts && (
        <div className="tool-result-charts">
          <div className="tool-result-charts-header">
            <svg className="tool-result-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
            <span>Generated Charts ({result.charts!.length})</span>
          </div>
          <div className="tool-result-charts-grid">
            {result.charts!.map((chart: any, idx: number) => (
              <div key={idx} className="tool-result-chart">
                {chart.data ? (
                  <img src={`data:image/png;base64,${chart.data}`} alt={`Chart ${idx + 1}`} />
                ) : (
                  <div className="tool-result-chart-placeholder">Chart data unavailable</div>
                )}
              </div>
            ))}
          </div>
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
