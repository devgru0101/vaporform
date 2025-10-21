'use client';

import { useState, useEffect } from 'react';
import { use } from 'react';
import dynamic from 'next/dynamic';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import { MonacoEditor } from '@/components/editor/MonacoEditor';
import { FileTree } from '@/components/editor/FileTree';
import { AgentChatPanel } from '@/components/ai/AgentChatPanel';
import { GitPanel } from '@/components/git/GitPanel';
import { api } from '@/lib/api';
import { useAuth } from '@clerk/nextjs';
import { useSettings } from '@/lib/contexts/SettingsContext';

// Dynamically import Terminal component to avoid SSR issues with xterm
const Terminal = dynamic(
  () => import('@/components/terminal/Terminal').then((mod) => mod.Terminal),
  { ssr: false, loading: () => <div style={{ padding: '20px', color: 'var(--vf-text-muted)' }}>Loading terminal...</div> }
);

export default function EditorPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  const { isLoaded, isSignedIn } = useAuth();
  const { openModal } = useSettings();
  const [currentFile, setCurrentFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [unsavedChanges, setUnsavedChanges] = useState(false);
  const [chatSessionId, setChatSessionId] = useState<string | null>(null);
  const [aiAssistantTab, setAiAssistantTab] = useState<'chat' | 'terminal' | 'git' | null>('chat');
  const [fileExplorerTab, setFileExplorerTab] = useState<'explorer' | 'search' | null>('explorer');
  const [showAiAssistant, setShowAiAssistant] = useState(true);
  const [showFileExplorer, setShowFileExplorer] = useState(true);
  const [viewMode, setViewMode] = useState<'editor' | 'preview'>('editor');
  const [workspaceUrl, setWorkspaceUrl] = useState<string | null>(null);
  const [workspaceToken, setWorkspaceToken] = useState<string | null>(null);
  const [workspacePort, setWorkspacePort] = useState<number | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [sandboxStatus, setSandboxStatus] = useState<'Not Running' | 'Starting' | 'Running' | 'Restarting' | 'Stopped' | 'Error'>('Not Running');

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      initializeSessions();
      fetchWorkspaceUrl();

      // Poll workspace status every 10 seconds
      const intervalId = setInterval(() => {
        fetchWorkspaceUrl();
      }, 10000);

      return () => clearInterval(intervalId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn, projectId]); // Functions are stable, we control when they're called

  async function initializeSessions() {
    try {
      // Create AI chat session
      const chatResponse = await api.createChatSession(projectId, 'Main Session');
      if (chatResponse.session) {
        setChatSessionId(chatResponse.session.id.toString());
      }
    } catch (error) {
      console.error('Failed to initialize sessions:', error);
    }
  }

  async function fetchWorkspaceUrl(showLoading: boolean = false) {
    try {
      if (showLoading) {
        setWorkspaceLoading(true);
      }
      const workspaceResponse = await api.getProjectWorkspace(projectId);

      if (workspaceResponse && workspaceResponse.workspace) {
        const workspace = workspaceResponse.workspace;

        // Store workspace ID for terminal component
        if (workspace.id) {
          setWorkspaceId(workspace.id.toString());
        }

        // Update sandbox status based on workspace status
        const status = workspace.status?.toLowerCase();
        if (status === 'running') {
          setSandboxStatus('Running');
        } else if (status === 'starting' || status === 'pending') {
          setSandboxStatus('Starting');
        } else if (status === 'stopped') {
          setSandboxStatus('Stopped');
        } else if (status === 'error') {
          setSandboxStatus('Error');
        } else {
          setSandboxStatus('Not Running');
        }

        // Check if workspace has a sandbox ID to get preview URL
        if (workspace.daytona_sandbox_id && status === 'running') {
          // Get preview URL from backend (uses Daytona's getPreviewLink API)
          try {
            const urlResponse = await api.getSandboxUrl(workspace.id.toString());
            if (urlResponse && urlResponse.url) {
              setWorkspaceUrl(urlResponse.url);
              setWorkspaceToken(urlResponse.token || null);
              setWorkspacePort(urlResponse.port || null);
              console.log('[Preview] Got sandbox URL:', urlResponse.url);
              console.log('[Preview] Got auth token:', urlResponse.token ? 'YES' : 'NO');
              console.log('[Preview] Port:', urlResponse.port);
            }
          } catch (error) {
            console.error('[Preview] Failed to get sandbox URL:', error);
          }
        }
      } else {
        // No workspace exists, could create one or show placeholder
        console.log('No workspace found for project');
        setSandboxStatus('Not Running');
        setWorkspaceId(null);
      }
    } catch (error) {
      console.error('Failed to fetch workspace URL:', error);
      setSandboxStatus('Error');
    } finally {
      if (showLoading) {
        setWorkspaceLoading(false);
      }
    }
  }

  async function handleForceRebuild() {
    try {
      setSandboxStatus('Restarting');
      setWorkspaceLoading(true);
      console.log('[Force Rebuild] Starting force rebuild for project', projectId);

      await api.forceRebuildWorkspace(projectId);

      console.log('[Force Rebuild] Successfully triggered rebuild');

      // Wait a moment then fetch the new workspace status
      await new Promise(resolve => setTimeout(resolve, 2000));
      await fetchWorkspaceUrl(true);
    } catch (error) {
      console.error('[Force Rebuild] Failed to rebuild workspace:', error);
      setSandboxStatus('Error');
      alert('Failed to rebuild workspace. Check console for details.');
    } finally {
      setWorkspaceLoading(false);
    }
  }

  async function handleFileSelect(path: string) {
    // Don't reload if same file is already selected and there are no unsaved changes
    if (currentFile === path && !unsavedChanges) {
      return;
    }

    // Warn if there are unsaved changes
    if (unsavedChanges && currentFile !== path) {
      const confirm = window.confirm('You have unsaved changes. Do you want to discard them?');
      if (!confirm) {
        return;
      }
    }

    try {
      const response = await api.readFile(projectId, path);
      if (response.content && response.metadata) {
        // Decode base64 content
        const content = atob(response.content);
        setFileContent(content);
        setCurrentFile(path);
        setUnsavedChanges(false);
      }
    } catch (error) {
      console.error('Failed to load file:', error);
    }
  }

  async function handleSave() {
    if (!currentFile) return;

    try {
      // Encode to base64
      const encoded = btoa(fileContent);
      await api.writeFile(projectId, currentFile, encoded, 'base64');
      setUnsavedChanges(false);
    } catch (error) {
      console.error('Failed to save file:', error);
    }
  }

  function handleEditorChange(value: string | undefined) {
    if (value !== undefined) {
      setFileContent(value);
      setUnsavedChanges(true);
    }
  }

  function toggleFileExplorerItem(item: 'explorer' | 'search') {
    if (fileExplorerTab === item) {
      setShowFileExplorer(!showFileExplorer);
    } else {
      setFileExplorerTab(item);
      setShowFileExplorer(true);
    }
  }

  if (!isLoaded) {
    return (
      <div style={{
        height: '100vh',
        width: '100vw',
        background: 'var(--vf-bg-primary)',
        color: 'var(--vf-text-primary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--vf-font-display)'
      }}>
        <div style={{ color: 'var(--vf-accent-success)', fontSize: 'var(--vf-text-xl)', fontWeight: 'var(--vf-weight-bold)' }}>
          LOADING...
        </div>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div style={{
        height: '100vh',
        width: '100vw',
        background: 'var(--vf-bg-primary)',
        color: 'var(--vf-text-primary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--vf-font-display)'
      }}>
        <div style={{ color: 'var(--vf-accent-danger)', fontSize: 'var(--vf-text-xl)', fontWeight: 'var(--vf-weight-bold)' }}>
          UNAUTHORIZED - PLEASE SIGN IN
        </div>
      </div>
    );
  }

  return (
    <>
      <style jsx>{`
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.3;
          }
        }
      `}</style>
      <div style={{
        height: '100vh',
        width: '100vw',
        background: 'var(--vf-bg-primary)',
        color: 'var(--vf-text-primary)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: 'var(--vf-font-body)'
      }}>
      {/* HEADER / TOP NAV */}
      <div style={{
        height: '40px',
        minHeight: '40px',
        background: 'var(--vf-bg-primary)',
        borderBottom: '1px solid var(--vf-border-primary)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 12px',
        gap: '24px'
      }}>
        {/* Brand */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontFamily: 'var(--vf-font-display)',
          fontSize: 'var(--vf-text-md)',
          fontWeight: 'var(--vf-weight-bold)',
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          color: 'var(--vf-text-primary)'
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M13 2L3 14l9 9L22 11z" strokeLinejoin="round"/>
          </svg>
          VAPORFORM
        </div>

        {/* Force Rebuild Button */}
        <div>
          <button
            onClick={handleForceRebuild}
            disabled={workspaceLoading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              background: workspaceLoading ? 'var(--vf-bg-tertiary)' : 'var(--vf-accent-danger)',
              color: workspaceLoading ? 'var(--vf-text-muted)' : 'var(--vf-bg-primary)',
              border: '2px solid',
              borderColor: workspaceLoading ? 'var(--vf-border-primary)' : 'var(--vf-accent-danger)',
              fontFamily: 'var(--vf-font-display)',
              fontSize: 'var(--vf-text-xs)',
              fontWeight: 'var(--vf-weight-bold)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              cursor: workspaceLoading ? 'not-allowed' : 'pointer',
              transition: 'all var(--vf-transition-fast)',
              opacity: workspaceLoading ? 0.5 : 1
            }}
            onMouseEnter={(e) => {
              if (!workspaceLoading) {
                e.currentTarget.style.background = 'var(--vf-bg-primary)';
                e.currentTarget.style.color = 'var(--vf-accent-danger)';
              }
            }}
            onMouseLeave={(e) => {
              if (!workspaceLoading) {
                e.currentTarget.style.background = 'var(--vf-accent-danger)';
                e.currentTarget.style.color = 'var(--vf-bg-primary)';
              }
            }}
            title="Destroy the old Daytona sandbox and create a new one"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
            </svg>
            Force Rebuild
          </button>
        </div>


        {/* Breadcrumb / File Info - Center */}
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 'var(--vf-space-3)',
          fontSize: 'var(--vf-text-sm)',
          fontFamily: 'var(--vf-font-mono)',
          color: 'var(--vf-text-secondary)'
        }}>
          {currentFile && (
            <>
              <span style={{ color: 'var(--vf-accent-active)' }}>{currentFile}</span>
              {unsavedChanges && (
                <>
                  <span style={{ color: 'var(--vf-text-muted)' }}>●</span>
                  <span style={{ color: 'var(--vf-accent-success)' }}>UNSAVED</span>
                </>
              )}
            </>
          )}
        </div>

        {/* Right Actions */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '16px' }}>
          {/* Save Button */}
          {unsavedChanges && (
            <button
              onClick={handleSave}
              style={{
                padding: '6px 12px',
                background: 'var(--vf-accent-primary)',
                color: 'var(--vf-bg-primary)',
                border: '2px solid var(--vf-accent-primary)',
                fontFamily: 'var(--vf-font-display)',
                fontSize: 'var(--vf-text-xs)',
                fontWeight: 'var(--vf-weight-bold)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                cursor: 'pointer',
                transition: 'all var(--vf-transition-fast)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--vf-accent-active)';
                e.currentTarget.style.borderColor = 'var(--vf-accent-active)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--vf-accent-primary)';
                e.currentTarget.style.borderColor = 'var(--vf-accent-primary)';
              }}
            >
              SAVE
            </button>
          )}

          {/* Settings Button */}
          <button
            onClick={openModal}
            style={{
              width: '32px',
              height: '32px',
              background: 'transparent',
              border: '2px solid transparent',
              color: 'var(--vf-text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all var(--vf-transition-fast)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--vf-text-primary)';
              e.currentTarget.style.borderColor = 'var(--vf-border-primary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--vf-text-muted)';
              e.currentTarget.style.borderColor = 'transparent';
            }}
            title="Settings"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M12 1v6m0 6v6m4.22-13.22l4.24 4.24M1.54 1.54l4.24 4.24M20.46 20.46l-4.24-4.24M1.54 20.46l4.24-4.24"/>
            </svg>
          </button>

          {/* User Menu (Simplified) */}
          <button
            onClick={() => window.location.href = '/dashboard'}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '4px 12px',
              background: 'transparent',
              border: '2px solid var(--vf-border-primary)',
              color: 'var(--vf-text-primary)',
              fontFamily: 'var(--vf-font-body)',
              fontSize: 'var(--vf-text-sm)',
              cursor: 'pointer',
              transition: 'all var(--vf-transition-fast)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--vf-accent-primary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--vf-border-primary)';
            }}
          >
            <div style={{
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              background: 'var(--vf-accent-primary)',
              color: 'var(--vf-bg-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'var(--vf-weight-bold)',
              fontSize: 'var(--vf-text-2xs)'
            }}>
              U
            </div>
            <span>User</span>
          </button>
        </div>
      </div>

      {/* MAIN CONTENT AREA - Resizable Panels */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <PanelGroup direction="horizontal">
          {/* ACTIVITY BAR - Fixed 48px */}
          <Panel defaultSize={2} minSize={2} maxSize={2} style={{
            background: 'var(--vf-bg-secondary)',
            borderRight: '2px solid var(--vf-border-primary)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            {/* Activity Bar Header */}
            <div style={{
              height: '36px',
              minHeight: '36px',
              background: 'var(--vf-bg-secondary)',
              borderBottom: '2px solid var(--vf-border-primary)'
            }} />
            {/* Activity Bar Icons */}
            <div style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: 'var(--vf-space-2) 0',
              gap: 'var(--vf-space-1)',
              overflow: 'hidden'
            }}>
        {/* Explorer Icon - toggles File Explorer */}
        <button
          onClick={() => toggleFileExplorerItem('explorer')}
          style={{
            width: '40px',
            height: '40px',
            background: fileExplorerTab === 'explorer' && showFileExplorer ? 'var(--vf-bg-primary)' : 'transparent',
            border: '2px solid',
            borderColor: fileExplorerTab === 'explorer' && showFileExplorer ? 'var(--vf-accent-primary)' : 'transparent',
            color: fileExplorerTab === 'explorer' ? 'var(--vf-accent-primary)' : 'var(--vf-text-muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all var(--vf-transition-fast)'
          }}
          title="Explorer"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 3v18h18V3H3zm16 2v2H5V5h14zm0 4v10H5V9h14z"/>
            <path d="M7 11h2v2H7zm4 0h6v2h-6zm-4 4h2v2H7zm4 0h6v2h-6z"/>
          </svg>
        </button>

        {/* Search Icon */}
        <button
          onClick={() => toggleFileExplorerItem('search')}
          style={{
            width: '40px',
            height: '40px',
            background: fileExplorerTab === 'search' && showFileExplorer ? 'var(--vf-bg-primary)' : 'transparent',
            border: '2px solid',
            borderColor: fileExplorerTab === 'search' && showFileExplorer ? 'var(--vf-accent-primary)' : 'transparent',
            color: fileExplorerTab === 'search' ? 'var(--vf-accent-primary)' : 'var(--vf-text-muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all var(--vf-transition-fast)'
          }}
          title="Search"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/>
            <path d="m21 21-4.35-4.35"/>
          </svg>
        </button>

        {/* Chat Icon - AI Assistant Chat */}
        <button
          onClick={() => {
            setAiAssistantTab('chat');
            setShowAiAssistant(true);
          }}
          style={{
            width: '40px',
            height: '40px',
            background: aiAssistantTab === 'chat' && showAiAssistant ? 'var(--vf-bg-primary)' : 'transparent',
            border: '2px solid',
            borderColor: aiAssistantTab === 'chat' && showAiAssistant ? 'var(--vf-accent-primary)' : 'transparent',
            color: aiAssistantTab === 'chat' ? 'var(--vf-accent-primary)' : 'var(--vf-text-muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all var(--vf-transition-fast)'
          }}
          title="Chat"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </button>

        {/* Terminal Icon - AI Assistant Terminal */}
        <button
          onClick={() => {
            setAiAssistantTab('terminal');
            setShowAiAssistant(true);
          }}
          style={{
            width: '40px',
            height: '40px',
            background: aiAssistantTab === 'terminal' && showAiAssistant ? 'var(--vf-bg-primary)' : 'transparent',
            border: '2px solid',
            borderColor: aiAssistantTab === 'terminal' && showAiAssistant ? 'var(--vf-accent-primary)' : 'transparent',
            color: aiAssistantTab === 'terminal' ? 'var(--vf-accent-primary)' : 'var(--vf-text-muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all var(--vf-transition-fast)'
          }}
          title="Terminal"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="4 17 10 11 4 5"/>
            <line x1="12" y1="19" x2="20" y2="19"/>
          </svg>
        </button>

        {/* Git Icon */}
        <button
          onClick={() => {
            setAiAssistantTab('git');
            setShowAiAssistant(true);
          }}
          style={{
            width: '40px',
            height: '40px',
            background: aiAssistantTab === 'git' && showAiAssistant ? 'var(--vf-bg-primary)' : 'transparent',
            border: '2px solid',
            borderColor: aiAssistantTab === 'git' && showAiAssistant ? 'var(--vf-accent-primary)' : 'transparent',
            color: aiAssistantTab === 'git' ? 'var(--vf-accent-primary)' : 'var(--vf-text-muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all var(--vf-transition-fast)'
          }}
          title="Source Control"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9l-6 6"/>
          </svg>
        </button>
            </div>
          </Panel>

          {/* AI ASSISTANT PANEL - Resizable 240-600px */}
          {showAiAssistant && (
            <>
              <PanelResizeHandle />
              <Panel defaultSize={15} minSize={10} maxSize={30} style={{
                background: 'var(--vf-bg-tertiary)',
                borderRight: '2px solid var(--vf-border-primary)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
              }}>
                {/* AI Assistant has no sub-header, content fills entire panel */}
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  {aiAssistantTab === 'chat' && (
                    <AgentChatPanel projectId={projectId} workspaceId={workspaceId || undefined} />
                  )}
                  {aiAssistantTab === 'terminal' && workspaceId && (
                    <Terminal
                      projectId={projectId}
                      workspaceId={workspaceId}
                    />
                  )}
                  {aiAssistantTab === 'git' && (
                    <GitPanel projectId={projectId} />
                  )}
                </div>
              </Panel>
            </>
          )}

          {/* RIGHT SIDE PANELS (File Explorer + Editor/Preview) */}
          <PanelResizeHandle />
          <Panel style={{
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            {/* SUB-HEADER (spans File Explorer + Editor columns) */}
            <div style={{
              height: '36px',
              minHeight: '36px',
              background: 'var(--vf-bg-secondary)',
              borderBottom: '2px solid var(--vf-border-primary)',
              display: 'flex',
              gap: '2px',
              padding: '0'
            }}>
        <button
          onClick={() => setViewMode('editor')}
          style={{
            padding: '8px 16px',
            background: viewMode === 'editor' ? 'var(--vf-bg-primary)' : 'transparent',
            border: 'none',
            borderBottom: viewMode === 'editor' ? '2px solid var(--vf-accent-primary)' : '2px solid transparent',
            color: viewMode === 'editor' ? 'var(--vf-accent-primary)' : 'var(--vf-text-muted)',
            fontFamily: 'var(--vf-font-display)',
            fontSize: 'var(--vf-text-xs)',
            fontWeight: 'var(--vf-weight-bold)',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            cursor: 'pointer',
            transition: 'all var(--vf-transition-fast)'
          }}
        >
          EDITOR
        </button>
        <button
          onClick={() => setViewMode('preview')}
          style={{
            padding: '8px 16px',
            background: viewMode === 'preview' ? 'var(--vf-bg-primary)' : 'transparent',
            border: 'none',
            borderBottom: viewMode === 'preview' ? '2px solid var(--vf-accent-primary)' : '2px solid transparent',
            color: viewMode === 'preview' ? 'var(--vf-accent-primary)' : 'var(--vf-text-muted)',
            fontFamily: 'var(--vf-font-display)',
            fontSize: 'var(--vf-text-xs)',
            fontWeight: 'var(--vf-weight-bold)',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            cursor: 'pointer',
            transition: 'all var(--vf-transition-fast)'
          }}
        >
          PREVIEW
        </button>
            </div>

            {/* Content area below sub-header */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
              {/* EDITOR MODE - File Explorer + Editor */}
              {viewMode === 'editor' && (
                <PanelGroup direction="horizontal">
                  {/* FILE EXPLORER - Resizable 150-400px */}
                  {showFileExplorer && (
                    <>
                      <Panel defaultSize={12} minSize={8} maxSize={20} style={{
                        background: 'var(--vf-bg-tertiary)',
                        borderRight: '2px solid var(--vf-border-primary)',
                        overflow: 'auto',
                        display: 'flex',
                        flexDirection: 'column'
                      }}>
                        {fileExplorerTab === 'explorer' && (
                          <FileTree
                            projectId={projectId}
                            onFileSelect={handleFileSelect}
                            selectedPath={currentFile || undefined}
                          />
                        )}
                        {fileExplorerTab === 'search' && (
                          <div style={{ padding: 'var(--vf-space-4)', color: 'var(--vf-text-muted)' }}>
                            Search functionality coming soon...
                          </div>
                        )}
                      </Panel>
                      <PanelResizeHandle />
                    </>
                  )}

                  {/* MAIN EDITOR AREA - Fills remaining space */}
                  <Panel style={{
                    background: 'var(--vf-bg-primary)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden'
                  }}>
                    {currentFile ? (
                      <MonacoEditor
                        value={fileContent}
                        language={getLanguageFromPath(currentFile)}
                        onChange={handleEditorChange}
                        onSave={handleSave}
                      />
                    ) : (
                      <div style={{
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexDirection: 'column',
                        gap: 'var(--vf-space-3)'
                      }}>
                        <div style={{
                          fontFamily: 'var(--vf-font-display)',
                          fontSize: 'var(--vf-text-2xl)',
                          fontWeight: 'var(--vf-weight-black)',
                          color: 'var(--vf-accent-primary)',
                          letterSpacing: '0.1em'
                        }}>
                          VAPORFORM EDITOR
                        </div>
                        <div style={{
                          fontFamily: 'var(--vf-font-body)',
                          fontSize: 'var(--vf-text-base)',
                          color: 'var(--vf-text-secondary)'
                        }}>
                          Select a file from the explorer to start editing
                        </div>
                      </div>
                    )}
                  </Panel>
                </PanelGroup>
              )}

              {/* PREVIEW MODE - Embedded iframe with authentication */}
              {viewMode === 'preview' && (
                <div style={{
                  flex: 1,
                  background: 'var(--vf-bg-primary)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden'
                }}>
          {workspaceLoading ? (
            <div style={{
              fontFamily: 'var(--vf-font-display)',
              fontSize: 'var(--vf-text-lg)',
              color: 'var(--vf-text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.1em'
            }}>
              LOADING WORKSPACE...
            </div>
          ) : (workspaceUrl && workspaceId) ? (
            <iframe
              src={`/api/preview/${workspaceId}/`}
              style={{
                width: '100%',
                height: '100%',
                border: 'none',
                background: 'var(--vf-bg-primary)'
              }}
              title="Project Preview"
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-downloads"
            />
          ) : (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 'var(--vf-space-4)'
            }}>
              <div style={{
                fontFamily: 'var(--vf-font-display)',
                fontSize: 'var(--vf-text-xl)',
                fontWeight: 'var(--vf-weight-bold)',
                color: 'var(--vf-accent-primary)',
                textTransform: 'uppercase',
                letterSpacing: '0.1em'
              }}>
                NO WORKSPACE FOUND
              </div>
              <div style={{
                fontFamily: 'var(--vf-font-body)',
                fontSize: 'var(--vf-text-base)',
                color: 'var(--vf-text-secondary)',
                textAlign: 'center',
                maxWidth: '400px'
              }}>
                This project doesn't have a Daytona sandbox yet. Create one to preview your application.
              </div>
              <button
                onClick={async () => {
                  try {
                    setWorkspaceLoading(true);
                    await api.createWorkspace(projectId, `Project ${projectId} Workspace`);
                    await fetchWorkspaceUrl(true);
                  } catch (error) {
                    console.error('Failed to create workspace:', error);
                    setWorkspaceLoading(false);
                  }
                }}
                style={{
                  padding: '12px 24px',
                  background: 'var(--vf-accent-primary)',
                  color: 'var(--vf-bg-primary)',
                  border: '2px solid var(--vf-accent-primary)',
                  fontFamily: 'var(--vf-font-display)',
                  fontSize: 'var(--vf-text-sm)',
                  fontWeight: 'var(--vf-weight-bold)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  cursor: 'pointer',
                  transition: 'all var(--vf-transition-fast)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--vf-bg-primary)';
                  e.currentTarget.style.color = 'var(--vf-accent-primary)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--vf-accent-primary)';
                  e.currentTarget.style.color = 'var(--vf-bg-primary)';
                }}
              >
                CREATE WORKSPACE
              </button>
            </div>
          )}
                </div>
              )}
            </div>
          </Panel>
        </PanelGroup>
      </div>

      {/* STATUS BAR */}
      <div style={{
        height: '24px',
        minHeight: '24px',
        background: 'var(--vf-bg-secondary)',
        borderTop: '2px solid var(--vf-border-primary)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 var(--vf-space-3)',
        gap: 'var(--vf-space-4)',
        fontFamily: 'var(--vf-font-mono)',
        fontSize: 'var(--vf-text-2xs)',
        color: 'var(--vf-text-secondary)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em'
      }}>
        {/* Connection Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--vf-space-1)' }}>
          <span style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: 'var(--vf-accent-success)',
            display: 'inline-block'
          }} />
          CONNECTED
        </div>

        {/* Encoding */}
        <div>UTF-8</div>

        {/* Language */}
        <div>{currentFile ? getLanguageDisplayName(currentFile) : 'NO FILE'}</div>

        {/* Cursor Position */}
        <div>LN 1, COL 1</div>

        {/* Right Side Items */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 'var(--vf-space-4)' }}>
          {/* Sandbox Status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--vf-space-1)' }}>
            <span style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: getSandboxStatusColor(sandboxStatus),
              display: 'inline-block',
              animation: sandboxStatus === 'Starting' || sandboxStatus === 'Restarting' ? 'pulse 1.5s ease-in-out infinite' : 'none'
            }} />
            SANDBOX: {sandboxStatus.toUpperCase().replace(' ', '-')}
          </div>

          {/* Problems */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--vf-space-1)' }}>
            <span style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: 'var(--vf-accent-success)',
              display: 'inline-block'
            }} />
            0 PROBLEMS
          </div>

          {/* Git Branch */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--vf-space-1)' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM5 9.5a3 3 0 1 0 6 0 3 3 0 0 0-6 0zm14 0a3 3 0 1 0 6 0 3 3 0 0 0-6 0zM9 13V9.5m6 0V16a3 3 0 0 0 3 3"/>
            </svg>
            MAIN
          </div>
        </div>
      </div>
    </div>
    </>
  );
}

function getSandboxStatusColor(status: string): string {
  switch (status) {
    case 'Running':
      return 'var(--vf-accent-success)';
    case 'Starting':
    case 'Restarting':
      return 'var(--vf-accent-warning)';
    case 'Stopped':
      return 'var(--vf-text-muted)';
    case 'Error':
      return 'var(--vf-accent-danger)';
    case 'Not Running':
    default:
      return 'var(--vf-text-muted)';
  }
}

function getLanguageDisplayName(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  const languageMap: Record<string, string> = {
    'ts': 'TypeScript',
    'tsx': 'TypeScript React',
    'js': 'JavaScript',
    'jsx': 'JavaScript React',
    'json': 'JSON',
    'css': 'CSS',
    'scss': 'SCSS',
    'html': 'HTML',
    'md': 'Markdown',
    'py': 'Python',
    'rs': 'Rust',
    'go': 'Go',
    'java': 'Java',
    'c': 'C',
    'cpp': 'C++',
    'sh': 'Shell',
  };
  return languageMap[ext || ''] || 'Plain Text';
}

function getLanguageFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  const languageMap: Record<string, string> = {
    'ts': 'typescript',
    'tsx': 'typescript',
    'js': 'javascript',
    'jsx': 'javascript',
    'json': 'json',
    'css': 'css',
    'scss': 'scss',
    'html': 'html',
    'md': 'markdown',
    'py': 'python',
    'rs': 'rust',
    'go': 'go',
    'java': 'java',
    'c': 'c',
    'cpp': 'cpp',
    'sh': 'shell',
  };
  return languageMap[ext || ''] || 'plaintext';
}
