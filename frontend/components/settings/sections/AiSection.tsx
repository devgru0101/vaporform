'use client';

import React, { useState } from 'react';
import { useSettings } from '@/lib/contexts/SettingsContext';

export const AiSection: React.FC = () => {
  const { settings, updateSettings } = useSettings();
  const [showApiKey, setShowApiKey] = useState(false);
  const [authMethod, setAuthMethod] = useState<'api_key' | 'oauth'>('api_key');
  const [isConnectingOAuth, setIsConnectingOAuth] = useState(false);

  const handleClaudeOAuthConnect = async () => {
    setIsConnectingOAuth(true);
    try {
      // Open OAuth flow in popup window
      const width = 600;
      const height = 700;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;

      const popup = window.open(
        `${process.env.NEXT_PUBLIC_API_URL}/auth/claude/oauth`,
        'Claude OAuth',
        `width=${width},height=${height},left=${left},top=${top}`
      );

      // Listen for OAuth callback
      const handleMessage = (event: MessageEvent) => {
        if (event.data.type === 'claude_oauth_success') {
          updateSettings({
            aiOAuthToken: event.data.token,
            aiOAuthProvider: 'claude'
          });
          popup?.close();
          window.removeEventListener('message', handleMessage);
          setIsConnectingOAuth(false);
        } else if (event.data.type === 'claude_oauth_error') {
          console.error('OAuth error:', event.data.error);
          popup?.close();
          window.removeEventListener('message', handleMessage);
          setIsConnectingOAuth(false);
          alert('Failed to connect Claude account. Please try again.');
        }
      };

      window.addEventListener('message', handleMessage);

      // Timeout after 5 minutes
      setTimeout(() => {
        if (popup && !popup.closed) {
          popup.close();
          window.removeEventListener('message', handleMessage);
          setIsConnectingOAuth(false);
        }
      }, 300000);
    } catch (error) {
      console.error('OAuth error:', error);
      setIsConnectingOAuth(false);
      alert('Failed to connect Claude account. Please try again.');
    }
  };

  const handleDisconnectOAuth = () => {
    updateSettings({
      aiOAuthToken: undefined,
      aiOAuthProvider: undefined
    });
  };

  return (
    <div className="vf-settings-section">
      <div className="vf-settings-section-header">
        <h2 className="vf-settings-section-title">Agentic Code Engine</h2>
        <p className="vf-settings-section-description">
          Configure the agentic code engine model, API provider, and advanced behavior settings
        </p>
      </div>

      <div className="vf-settings-section-content">
        {/* API Provider Configuration */}
        <div className="vf-settings-group">
          <h3 className="vf-settings-group-title">API Provider</h3>
          <div className="vf-settings-group-content">
            <div className="vf-settings-field-row">
              <div className="vf-settings-field-info">
                <label className="vf-settings-field-label">Provider</label>
                <span className="vf-settings-field-description">
                  Select your AI API provider
                </span>
              </div>
              <div className="vf-settings-field-control">
                <select
                  value={settings.aiProvider || 'anthropic'}
                  onChange={(e) => updateSettings({ aiProvider: e.target.value })}
                  className="vf-settings-select"
                >
                  <option value="anthropic">Anthropic</option>
                  <option value="openai">OpenAI</option>
                  <option value="openrouter">OpenRouter</option>
                  <option value="azure">Azure OpenAI</option>
                  <option value="ollama">Ollama (Local)</option>
                  <option value="custom">Custom OpenAI-Compatible</option>
                </select>
              </div>
            </div>

            {/* Authentication Method Selection (Anthropic only) */}
            {settings.aiProvider === 'anthropic' && (
              <div className="vf-settings-field-row">
                <div className="vf-settings-field-info">
                  <label className="vf-settings-field-label">Authentication Method</label>
                  <span className="vf-settings-field-description">
                    Choose how to authenticate with Claude
                  </span>
                </div>
                <div className="vf-settings-field-control">
                  <select
                    value={settings.aiOAuthToken ? 'oauth' : 'api_key'}
                    onChange={(e) => setAuthMethod(e.target.value as 'api_key' | 'oauth')}
                    className="vf-settings-select"
                  >
                    <option value="api_key">API Key</option>
                    <option value="oauth">Claude Subscription (OAuth)</option>
                  </select>
                </div>
              </div>
            )}

            {/* API Key Input (for non-Anthropic or when API key method selected) */}
            {(settings.aiProvider !== 'anthropic' || !settings.aiOAuthToken) && (
              <div className="vf-settings-field-row">
                <div className="vf-settings-field-info">
                  <label className="vf-settings-field-label">API Key</label>
                  <span className="vf-settings-field-description">
                    Your API key for the selected provider (stored securely)
                  </span>
                </div>
                <div className="vf-settings-field-control">
                  <div style={{ display: 'flex', gap: 'var(--vf-space-2)', alignItems: 'center', width: '100%' }}>
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      value={settings.aiApiKey || ''}
                      onChange={(e) => updateSettings({ aiApiKey: e.target.value })}
                      placeholder={settings.aiProvider === 'anthropic' ? 'sk-ant-...' : 'Your API key'}
                      className="vf-settings-input"
                      style={{ flex: 1 }}
                      autoFocus={false}
                    />
                    <button
                      onClick={() => setShowApiKey(!showApiKey)}
                      style={{
                        padding: '6px 12px',
                        background: 'transparent',
                        border: '1px solid var(--vf-border-primary)',
                        color: 'var(--vf-text-secondary)',
                        cursor: 'pointer',
                        fontSize: 'var(--vf-text-xs)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em'
                      }}
                    >
                      {showApiKey ? 'HIDE' : 'SHOW'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* OAuth Connection (Anthropic only) */}
            {settings.aiProvider === 'anthropic' && settings.aiOAuthToken && (
              <div className="vf-settings-field-row">
                <div className="vf-settings-field-info">
                  <label className="vf-settings-field-label">Claude Account</label>
                  <span className="vf-settings-field-description">
                    Connected via Claude subscription
                  </span>
                </div>
                <div className="vf-settings-field-control">
                  <div style={{ display: 'flex', gap: 'var(--vf-space-2)', alignItems: 'center', width: '100%' }}>
                    <div style={{
                      flex: 1,
                      padding: '8px 12px',
                      background: 'var(--vf-surface-secondary)',
                      border: '1px solid var(--vf-border-primary)',
                      color: 'var(--vf-text-primary)',
                      fontSize: 'var(--vf-text-sm)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}>
                      <span style={{ color: '#22c55e' }}>✓</span>
                      <span>Connected</span>
                    </div>
                    <button
                      onClick={handleDisconnectOAuth}
                      style={{
                        padding: '6px 12px',
                        background: 'transparent',
                        border: '1px solid var(--vf-border-primary)',
                        color: 'var(--vf-text-secondary)',
                        cursor: 'pointer',
                        fontSize: 'var(--vf-text-xs)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em'
                      }}
                    >
                      DISCONNECT
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* OAuth Connect Button (when not connected) */}
            {settings.aiProvider === 'anthropic' && !settings.aiOAuthToken && authMethod === 'oauth' && (
              <div className="vf-settings-field-row">
                <div className="vf-settings-field-info">
                  <label className="vf-settings-field-label">Connect Account</label>
                  <span className="vf-settings-field-description">
                    Connect your Claude subscription to use your plan's API access
                  </span>
                </div>
                <div className="vf-settings-field-control">
                  <button
                    onClick={handleClaudeOAuthConnect}
                    disabled={isConnectingOAuth}
                    style={{
                      padding: '8px 16px',
                      background: 'var(--vf-accent-primary)',
                      border: '2px solid var(--vf-border-primary)',
                      color: 'var(--vf-text-inverse)',
                      cursor: isConnectingOAuth ? 'not-allowed' : 'pointer',
                      fontSize: 'var(--vf-text-sm)',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      opacity: isConnectingOAuth ? 0.6 : 1
                    }}
                  >
                    {isConnectingOAuth ? 'CONNECTING...' : 'CONNECT CLAUDE ACCOUNT'}
                  </button>
                </div>
              </div>
            )}

            {(settings.aiProvider === 'custom' || settings.aiProvider === 'ollama') && (
              <div className="vf-settings-field-row">
                <div className="vf-settings-field-info">
                  <label className="vf-settings-field-label">Base URL</label>
                  <span className="vf-settings-field-description">
                    Custom API endpoint URL
                  </span>
                </div>
                <div className="vf-settings-field-control">
                  <input
                    type="text"
                    value={settings.aiBaseUrl || ''}
                    onChange={(e) => updateSettings({ aiBaseUrl: e.target.value })}
                    placeholder={settings.aiProvider === 'ollama' ? 'http://localhost:11434' : 'https://api.example.com'}
                    className="vf-settings-input"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Model Configuration */}
        <div className="vf-settings-group">
          <h3 className="vf-settings-group-title">Model Configuration</h3>
          <div className="vf-settings-group-content">
            <div className="vf-settings-field-row">
              <div className="vf-settings-field-info">
                <label className="vf-settings-field-label">AI Model</label>
                <span className="vf-settings-field-description">
                  Select the AI model for agentic code generation
                </span>
              </div>
              <div className="vf-settings-field-control">
                <select
                  value={settings.aiModel}
                  onChange={(e) => updateSettings({ aiModel: e.target.value })}
                  className="vf-settings-select"
                >
                  <optgroup label="Claude 4 (Latest)">
                    <option value="claude-sonnet-4-5-20250929">Claude Sonnet 4.5 (Best - Recommended)</option>
                    <option value="claude-opus-4-1-20250514">Claude Opus 4.1 (Most Capable)</option>
                    <option value="claude-sonnet-4-20250514">Claude Sonnet 4</option>
                  </optgroup>
                  <optgroup label="Claude 3.5">
                    <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</option>
                    <option value="claude-3-5-haiku-20241022">Claude 3.5 Haiku</option>
                  </optgroup>
                  <optgroup label="Claude 3">
                    <option value="claude-3-opus-20240229">Claude 3 Opus</option>
                    <option value="claude-3-haiku-20240307">Claude 3 Haiku</option>
                  </optgroup>
                  <optgroup label="GPT (OpenAI)">
                    <option value="gpt-4-turbo">GPT-4 Turbo</option>
                    <option value="gpt-4">GPT-4</option>
                    <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                  </optgroup>
                  <optgroup label="Other">
                    <option value="custom">Custom Model ID</option>
                  </optgroup>
                </select>
              </div>
            </div>

            {settings.aiModel === 'custom' && (
              <div className="vf-settings-field-row">
                <div className="vf-settings-field-info">
                  <label className="vf-settings-field-label">Custom Model ID</label>
                  <span className="vf-settings-field-description">
                    Enter the exact model identifier
                  </span>
                </div>
                <div className="vf-settings-field-control">
                  <input
                    type="text"
                    value={settings.aiCustomModelId || ''}
                    onChange={(e) => updateSettings({ aiCustomModelId: e.target.value })}
                    placeholder="e.g., llama3.1"
                    className="vf-settings-input"
                  />
                </div>
              </div>
            )}

            <div className="vf-settings-field-row">
              <div className="vf-settings-field-info">
                <label className="vf-settings-field-label">Temperature</label>
                <span className="vf-settings-field-description">
                  Control randomness in AI responses (0.0 = deterministic, 1.0 = creative)
                </span>
              </div>
              <div className="vf-settings-field-control">
                <div style={{ display: 'flex', gap: 'var(--vf-space-3)', alignItems: 'center', width: '100%' }}>
                  <input
                    type="range"
                    value={settings.aiTemperature}
                    onChange={(e) => updateSettings({ aiTemperature: parseFloat(e.target.value) })}
                    min="0"
                    max="1"
                    step="0.1"
                    style={{ flex: 1 }}
                  />
                  <input
                    type="number"
                    value={settings.aiTemperature}
                    onChange={(e) => updateSettings({ aiTemperature: parseFloat(e.target.value) })}
                    min="0"
                    max="1"
                    step="0.1"
                    className="vf-settings-input"
                    style={{ width: '80px' }}
                  />
                </div>
              </div>
            </div>

            <div className="vf-settings-field-row">
              <div className="vf-settings-field-info">
                <label className="vf-settings-field-label">Max Output Tokens</label>
                <span className="vf-settings-field-description">
                  Maximum tokens per AI response (higher = longer responses, more cost)
                </span>
              </div>
              <div className="vf-settings-field-control">
                <input
                  type="number"
                  value={settings.aiMaxTokens}
                  onChange={(e) => updateSettings({ aiMaxTokens: parseInt(e.target.value) })}
                  min="1024"
                  max="32768"
                  step="1024"
                  className="vf-settings-input"
                  style={{ width: '120px' }}
                />
              </div>
            </div>

            <div className="vf-settings-field-row">
              <div className="vf-settings-field-info">
                <label className="vf-settings-field-label">Context Window</label>
                <span className="vf-settings-field-description">
                  Maximum context size for code analysis (tokens)
                </span>
              </div>
              <div className="vf-settings-field-control">
                <select
                  value={settings.aiContextWindow || 200000}
                  onChange={(e) => updateSettings({ aiContextWindow: parseInt(e.target.value) })}
                  className="vf-settings-select"
                >
                  <option value="32000">32K (Standard)</option>
                  <option value="128000">128K (Extended)</option>
                  <option value="200000">200K (Maximum)</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Advanced Settings */}
        <div className="vf-settings-group">
          <h3 className="vf-settings-group-title">Agent Behavior</h3>
          <div className="vf-settings-group-content">
            <div className="vf-settings-field-row">
              <div className="vf-settings-field-info">
                <label className="vf-settings-field-label">Enable Prompt Caching</label>
                <span className="vf-settings-field-description">
                  Cache system prompts to reduce latency and costs (Anthropic only)
                </span>
              </div>
              <div className="vf-settings-field-control">
                <input
                  type="checkbox"
                  checked={settings.aiEnablePromptCaching || false}
                  onChange={(e) => updateSettings({ aiEnablePromptCaching: e.target.checked })}
                  className="vf-settings-checkbox"
                />
              </div>
            </div>

            <div className="vf-settings-field-row">
              <div className="vf-settings-field-info">
                <label className="vf-settings-field-label">Streaming Responses</label>
                <span className="vf-settings-field-description">
                  Stream AI responses in real-time for faster perceived performance
                </span>
              </div>
              <div className="vf-settings-field-control">
                <input
                  type="checkbox"
                  checked={settings.aiEnableStreaming !== false}
                  onChange={(e) => updateSettings({ aiEnableStreaming: e.target.checked })}
                  className="vf-settings-checkbox"
                />
              </div>
            </div>

            <div className="vf-settings-field-row">
              <div className="vf-settings-field-info">
                <label className="vf-settings-field-label">Auto-Approve Code Edits</label>
                <span className="vf-settings-field-description">
                  Automatically apply code changes without manual approval
                </span>
              </div>
              <div className="vf-settings-field-control">
                <input
                  type="checkbox"
                  checked={settings.aiAutoApproveEdits || false}
                  onChange={(e) => updateSettings({ aiAutoApproveEdits: e.target.checked })}
                  className="vf-settings-checkbox"
                />
              </div>
            </div>

            <div className="vf-settings-field-row">
              <div className="vf-settings-field-info">
                <label className="vf-settings-field-label">Enable Diff Strategy</label>
                <span className="vf-settings-field-description">
                  Use intelligent diffs for faster and more accurate code edits
                </span>
              </div>
              <div className="vf-settings-field-control">
                <input
                  type="checkbox"
                  checked={settings.aiEnableDiffStrategy !== false}
                  onChange={(e) => updateSettings({ aiEnableDiffStrategy: e.target.checked })}
                  className="vf-settings-checkbox"
                />
              </div>
            </div>

            <div className="vf-settings-field-row">
              <div className="vf-settings-field-info">
                <label className="vf-settings-field-label">Consecutive Error Limit</label>
                <span className="vf-settings-field-description">
                  Number of consecutive errors before showing intervention dialog (0 = unlimited)
                </span>
              </div>
              <div className="vf-settings-field-control">
                <input
                  type="number"
                  value={settings.aiConsecutiveErrorLimit || 3}
                  onChange={(e) => updateSettings({ aiConsecutiveErrorLimit: parseInt(e.target.value) })}
                  min="0"
                  max="10"
                  className="vf-settings-input"
                  style={{ width: '80px' }}
                />
              </div>
            </div>

            <div className="vf-settings-field-row">
              <div className="vf-settings-field-info">
                <label className="vf-settings-field-label">AI Autocomplete</label>
                <span className="vf-settings-field-description">
                  Enable AI-powered code completion suggestions as you type
                </span>
              </div>
              <div className="vf-settings-field-control">
                <input
                  type="checkbox"
                  checked={settings.aiAutoComplete}
                  onChange={(e) => updateSettings({ aiAutoComplete: e.target.checked })}
                  className="vf-settings-checkbox"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Rate Limiting */}
        <div className="vf-settings-group">
          <h3 className="vf-settings-group-title">Rate Limiting & Cost Control</h3>
          <div className="vf-settings-group-content">
            <div className="vf-settings-field-row">
              <div className="vf-settings-field-info">
                <label className="vf-settings-field-label">Rate Limit (seconds)</label>
                <span className="vf-settings-field-description">
                  Minimum time between API requests to avoid rate limits
                </span>
              </div>
              <div className="vf-settings-field-control">
                <input
                  type="number"
                  value={settings.aiRateLimit || 0}
                  onChange={(e) => updateSettings({ aiRateLimit: parseInt(e.target.value) })}
                  min="0"
                  max="60"
                  className="vf-settings-input"
                  style={{ width: '80px' }}
                />
              </div>
            </div>

            <div className="vf-settings-field-row">
              <div className="vf-settings-field-info">
                <label className="vf-settings-field-label">Max API Requests Per Task</label>
                <span className="vf-settings-field-description">
                  Limit requests before asking for approval (0 = unlimited)
                </span>
              </div>
              <div className="vf-settings-field-control">
                <input
                  type="number"
                  value={settings.aiMaxRequests || 0}
                  onChange={(e) => updateSettings({ aiMaxRequests: parseInt(e.target.value) })}
                  min="0"
                  max="100"
                  className="vf-settings-input"
                  style={{ width: '80px' }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
