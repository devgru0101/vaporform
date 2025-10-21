import React from 'react';
import { CodeExecutionResult } from './CodeExecutionResult';
import { CommandResult } from './CommandResult';

export interface ToolResult {
  success?: boolean;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  content?: string;
  error?: string;
  files?: Array<{ path: string; size?: number; type?: string }>;
  charts?: any[];
  artifacts?: any;
  language?: string;
  [key: string]: any;
}

interface ToolResultRendererProps {
  toolName: string;
  result: ToolResult | string;
}

export const ToolResultRenderer: React.FC<ToolResultRendererProps> = ({ toolName, result }) => {
  // Parse string results to objects
  let parsedResult: ToolResult = {};
  if (typeof result === 'string') {
    try {
      parsedResult = JSON.parse(result);
    } catch {
      // If it's not JSON, treat it as stdout
      parsedResult = { content: result, success: true };
    }
  } else {
    parsedResult = result;
  }

  // Render based on tool type
  switch (toolName) {
    case 'run_code':
      return <CodeExecutionResult result={parsedResult} />;

    case 'execute_command':
    case 'git_commit':
    case 'git_push':
      return <CommandResult toolName={toolName} result={parsedResult} />;

    case 'read_file':
      return <FileReadResult result={parsedResult} />;

    case 'write_file':
      return <FileWriteResult result={parsedResult} />;

    case 'list_directory':
      return <DirectoryListResult result={parsedResult} />;

    default:
      // Generic fallback for all other tools
      return <GenericToolResult toolName={toolName} result={parsedResult} />;
  }
};

// File Read Result Component
const FileReadResult: React.FC<{ result: ToolResult }> = ({ result }) => {
  return (
    <div className="tool-result tool-result-file-read">
      <div className="tool-result-header">
        <svg className="tool-result-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
        <span className="tool-result-title">File Content</span>
      </div>
      {result.content && (
        <pre className="tool-result-code">{result.content}</pre>
      )}
      {result.error && (
        <div className="tool-result-error">{result.error}</div>
      )}
    </div>
  );
};

// File Write Result Component
const FileWriteResult: React.FC<{ result: ToolResult }> = ({ result }) => {
  return (
    <div className="tool-result tool-result-file-write">
      <div className="tool-result-header">
        <svg className="tool-result-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
        </svg>
        <span className="tool-result-title">
          {result.success ? 'File Saved Successfully' : 'File Save Failed'}
        </span>
      </div>
      {result.error && (
        <div className="tool-result-error">{result.error}</div>
      )}
    </div>
  );
};

// Directory List Result Component
const DirectoryListResult: React.FC<{ result: ToolResult }> = ({ result }) => {
  return (
    <div className="tool-result tool-result-directory-list">
      <div className="tool-result-header">
        <svg className="tool-result-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
        <span className="tool-result-title">Directory Contents</span>
      </div>
      {result.files && result.files.length > 0 ? (
        <div className="tool-result-file-list">
          {result.files.map((file, idx) => (
            <div key={idx} className="tool-result-file-item">
              <svg className="file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <span className="file-path">{file.path}</span>
              {file.size && <span className="file-size">{formatFileSize(file.size)}</span>}
            </div>
          ))}
        </div>
      ) : (
        <div className="tool-result-empty">No files found</div>
      )}
      {result.error && (
        <div className="tool-result-error">{result.error}</div>
      )}
    </div>
  );
};

// Generic Tool Result Component (fallback for unknown tools)
const GenericToolResult: React.FC<{ toolName: string; result: ToolResult }> = ({ toolName, result }) => {
  return (
    <div className="tool-result tool-result-generic">
      <div className="tool-result-header">
        <svg className="tool-result-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
        <span className="tool-result-title">{formatToolName(toolName)}</span>
      </div>
      <pre className="tool-result-json">{JSON.stringify(result, null, 2)}</pre>
    </div>
  );
};

// Helper functions
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatToolName(toolName: string): string {
  return toolName
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
