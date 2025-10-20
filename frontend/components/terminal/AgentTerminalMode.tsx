'use client';

import { useState, useRef, useEffect } from 'react';
import { api } from '@/lib/api';
import { parseMarkdown } from '../ai/markdown';
import './AgentTerminalMode.css';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolsUsed?: Array<{
    name: string;
    status: 'success' | 'error';
  }>;
  context?: {
    filesAccessed?: string[];
    commandsRun?: string[];
    errorsEncountered?: string[];
  };
  timestamp: Date;
}

interface AgentTerminalModeProps {
  projectId: string;
  workspaceId: string;
  agentMode?: 'chat' | 'terminal';
  onModeChange?: (mode: 'chat' | 'terminal') => void;
}

export function AgentTerminalMode({ projectId, workspaceId, agentMode = 'terminal', onModeChange }: AgentTerminalModeProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      console.log('[AgentTerminalMode] Sending message:', input);

      const response = await api.sendTerminalAgentMessage({
        projectId,
        workspaceId,
        message: input,
        sessionId: sessionId || undefined
      });

      console.log('[AgentTerminalMode] Received response:', response);

      setSessionId(response.sessionId);

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.response,
        toolsUsed: response.toolsUsed,
        context: response.context,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error: any) {
      console.error('[AgentTerminalMode] Error:', error);

      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Sorry, I encountered an error: ${error.message || 'Unknown error'}. Please try again.`,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearChat = () => {
    setMessages([]);
    setSessionId(null);
  };

  return (
    <div className="terminal-agent-container">
      {/* Messages Area */}
      <div className="terminal-agent-messages">
        {messages.length === 0 && (
          <div className="terminal-agent-empty">
            <div className="terminal-agent-icon-wrapper">
              <svg
                className="terminal-agent-icon"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth="1.5"
              >
                <polyline points="4 17 10 11 4 5" />
                <line x1="12" y1="19" x2="20" y2="19" />
              </svg>
            </div>
            <p className="terminal-agent-title">AI Terminal Agent</p>
            <p className="terminal-agent-description">
              Ask me to run commands, read files, debug issues, or help with your code.
              I have full access to your workspace and can execute commands for you.
            </p>
            <div className="terminal-agent-suggestions">
              <p className="terminal-agent-suggestions-title">Try asking:</p>
              <ul className="terminal-agent-suggestions-list">
                <li>"List all JavaScript files in the src directory"</li>
                <li>"Show me the contents of package.json"</li>
                <li>"Run npm test and tell me what failed"</li>
                <li>"Find all files that import from 'react'"</li>
              </ul>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`terminal-message-wrapper ${msg.role === 'user' ? 'terminal-message-user' : 'terminal-message-assistant'}`}>
            <div className={`terminal-message ${msg.role === 'user' ? 'terminal-message-user-bubble' : 'terminal-message-assistant-bubble'}`}>
              {/* Message Content */}
              <div
                className="terminal-message-content"
                dangerouslySetInnerHTML={{ __html: parseMarkdown(msg.content) }}
              />

              {/* Tools Used */}
              {msg.toolsUsed && msg.toolsUsed.length > 0 && (
                <div className="terminal-message-tools">
                  <div className="terminal-message-tools-label">Tools Used:</div>
                  <div className="terminal-message-tools-list">
                    {msg.toolsUsed.map((tool, idx) => (
                      <span
                        key={idx}
                        className={`terminal-tool-badge ${tool.status === 'success' ? 'terminal-tool-success' : 'terminal-tool-error'}`}
                      >
                        {tool.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Context Info */}
              {msg.context && (
                <div className="terminal-message-context">
                  {msg.context.filesAccessed && msg.context.filesAccessed.length > 0 && (
                    <div className="terminal-context-item">
                      <span className="terminal-context-label">Files: </span>
                      {msg.context.filesAccessed.join(', ')}
                    </div>
                  )}
                  {msg.context.commandsRun && msg.context.commandsRun.length > 0 && (
                    <div className="terminal-context-item">
                      <span className="terminal-context-label">Commands: </span>
                      {msg.context.commandsRun.join('; ')}
                    </div>
                  )}
                  {msg.context.errorsEncountered && msg.context.errorsEncountered.length > 0 && (
                    <div className="terminal-context-item terminal-context-error">
                      <span className="terminal-context-label">Errors: </span>
                      {msg.context.errorsEncountered.join('; ')}
                    </div>
                  )}
                </div>
              )}

              {/* Timestamp */}
              <div className="terminal-message-timestamp">
                {msg.timestamp.toLocaleTimeString()}
              </div>
            </div>
          </div>
        ))}

        {loading && (
          <div className="terminal-message-wrapper terminal-message-assistant">
            <div className="terminal-message terminal-message-assistant-bubble">
              <div className="terminal-loading">
                <div className="terminal-loading-spinner" />
                <span className="terminal-loading-text">Agent is thinking and executing tools...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="terminal-agent-input-container">
        <div className="terminal-mode-toggle">
          <button
            className={`terminal-mode-button terminal-mode-chat ${agentMode === 'chat' ? 'active' : ''}`}
            onClick={() => onModeChange?.('chat')}
            aria-label="Chat mode"
            title="Chat Mode"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </button>
          <button
            className={`terminal-mode-button terminal-mode-terminal ${agentMode === 'terminal' ? 'active' : ''}`}
            onClick={() => onModeChange?.('terminal')}
            aria-label="Terminal mode"
            title="Terminal Mode"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="4 17 10 11 4 5" />
              <line x1="12" y1="19" x2="20" y2="19" />
            </svg>
          </button>
        </div>
        <div className="terminal-agent-input-wrapper">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="Ask the AI agent to run commands, read files, or help debug..."
            className="terminal-agent-input"
            disabled={loading}
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="terminal-agent-send-button"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
