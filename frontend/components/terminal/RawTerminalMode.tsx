'use client';

import { useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { api } from '@/lib/api';
import { useAuth } from '@clerk/nextjs';
import 'xterm/css/xterm.css';

interface RawTerminalModeProps {
  workspaceId: string;
  projectId: string;
}

type ConnectionState = 'initializing' | 'connecting' | 'connected' | 'disconnected' | 'error';

export function RawTerminalMode({ workspaceId, projectId }: RawTerminalModeProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('initializing');
  const [error, setError] = useState<string | null>(null);
  const [workspaceStatus, setWorkspaceStatus] = useState<string>('unknown');
  const { getToken } = useAuth();

  useEffect(() => {
    let mounted = true;
    let terminal: Terminal | null = null;
    let fitAddon: FitAddon | null = null;
    let ws: WebSocket | null = null;

    const initializeTerminal = async () => {
      try {
        setConnectionState('initializing');
        setError(null);

        console.log('[RawTerminalMode] Checking workspace status for:', workspaceId);

        // First, check workspace status
        const workspaceResponse = await api.getProjectWorkspace(projectId);

        if (!workspaceResponse || !workspaceResponse.workspace) {
          throw new Error('Workspace not found. Please create or start the workspace first.');
        }

        const workspace = workspaceResponse.workspace;
        setWorkspaceStatus(workspace.status);

        console.log('[RawTerminalMode] Workspace status:', workspace.status);

        // Only allow connection if workspace is running
        if (workspace.status !== 'running') {
          const statusMessage = workspace.status === 'error'
            ? 'Workspace is in error state. Use "Force Rebuild" to recreate it.'
            : workspace.status === 'stopped'
            ? 'Workspace is stopped. Starting it now...'
            : workspace.status === 'starting'
            ? 'Workspace is starting. Please wait...'
            : `Workspace status: ${workspace.status}`;

          throw new Error(statusMessage);
        }

        if (!mounted) return;

        setConnectionState('connecting');

        // Create terminal session via API with workspace ID
        console.log('[RawTerminalMode] Creating terminal session with workspace ID:', workspace.id);
        const response = await api.createTerminalSession(projectId, workspace.id.toString());

        if (!mounted) return;

        if (!response.session || !response.session.id) {
          throw new Error('Failed to create terminal session');
        }

        const newSessionId = response.session.id.toString();
        setSessionId(newSessionId);

        console.log('[RawTerminalMode] Terminal session created:', newSessionId);

        // Get auth token
        const token = await getToken();
        if (!token) {
          throw new Error('No authentication token available');
        }

        if (!mounted) return;

        // Initialize xterm.js with cyberpunk theme
        terminal = new Terminal({
          cursorBlink: true,
          cursorStyle: 'block',
          fontSize: 14,
          fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", Menlo, Monaco, "Courier New", monospace',
          fontWeight: '400',
          fontWeightBold: '700',
          lineHeight: 1.2,
          letterSpacing: 0,
          theme: {
            background: '#000000',
            foreground: '#00FF41',
            cursor: '#00FF41',
            cursorAccent: '#000000',
            selectionBackground: 'rgba(0, 255, 65, 0.3)',
            selectionForeground: '#000000',
            black: '#000000',
            red: '#FF0055',
            green: '#00FF41',
            yellow: '#FFFF00',
            blue: '#0099FF',
            magenta: '#FF00FF',
            cyan: '#00FFFF',
            white: '#FFFFFF',
            brightBlack: '#555555',
            brightRed: '#FF5555',
            brightGreen: '#55FF55',
            brightYellow: '#FFFF55',
            brightBlue: '#5555FF',
            brightMagenta: '#FF55FF',
            brightCyan: '#55FFFF',
            brightWhite: '#FFFFFF',
          },
          scrollback: 10000,
          convertEol: true,
          allowProposedApi: true,
          allowTransparency: false,
        });

        fitAddon = new FitAddon();
        terminal.loadAddon(fitAddon);

        // Attach terminal to DOM
        if (terminalRef.current && mounted) {
          console.log('[RawTerminalMode] Attaching terminal to DOM element:', terminalRef.current);
          console.log('[RawTerminalMode] Element dimensions:', terminalRef.current.clientWidth, 'x', terminalRef.current.clientHeight);

          terminal.open(terminalRef.current);

          // Store refs immediately
          xtermRef.current = terminal;
          fitAddonRef.current = fitAddon;

          // Show welcome message immediately to verify rendering
          terminal.write('\r\n\x1b[1;32m>>> VAPORFORM TERMINAL INITIALIZING <<<\x1b[0m\r\n');
          terminal.write('\x1b[1;33m>>> Cursor test: █ <<<\x1b[0m\r\n');
          terminal.write('\x1b[1;36m>>> Connecting to workspace...\x1b[0m\r\n\r\n');

          console.log('[RawTerminalMode] Terminal attached, initial dimensions:', terminal.cols, 'x', terminal.rows);

          // Fit terminal after DOM attachment
          setTimeout(() => {
            if (fitAddon && terminal && mounted && terminalRef.current) {
              try {
                console.log('[RawTerminalMode] Container size before fit:',
                  terminalRef.current.clientWidth, 'x', terminalRef.current.clientHeight);

                fitAddon.fit();

                console.log('[RawTerminalMode] Terminal resized to:', terminal.cols, 'x', terminal.rows);

                // Test write after fit
                terminal.write('\x1b[1;32m>>> Terminal ready (' + terminal.cols + 'x' + terminal.rows + ') <<<\x1b[0m\r\n');
              } catch (err) {
                console.error('[RawTerminalMode] Fit error:', err);
                terminal.write('\x1b[1;31m>>> Fit error: ' + err + ' <<<\x1b[0m\r\n');
              }
            }
          }, 100);
        }

        // Connect WebSocket
        const wsUrl = `ws://localhost:4001?sessionId=${newSessionId}&token=${token}`;
        console.log('[RawTerminalMode] Connecting to WebSocket...');

        ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        let connectionTimeout = setTimeout(() => {
          if (ws && ws.readyState !== WebSocket.OPEN) {
            console.error('[RawTerminalMode] Connection timeout');
            ws.close();
            setError('Connection timeout. Backend may not be running.');
            setConnectionState('error');
          }
        }, 10000);

        ws.onopen = () => {
          clearTimeout(connectionTimeout);
          console.log('[RawTerminalMode] WebSocket connected');
          if (mounted) {
            setConnectionState('connected');

            // Clear welcome message and show connected message
            if (terminal) {
              terminal.clear();
              terminal.writeln('\x1b[1;32m✓ Connected to Daytona workspace\x1b[0m\r\n');
            }
          }
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);

            switch (message.type) {
              case 'output':
                if (terminal && mounted) {
                  terminal.write(message.data);
                }
                break;

              case 'exit':
                console.log('[RawTerminalMode] PTY exited with code:', message.exitCode);
                if (terminal && mounted) {
                  terminal.writeln(`\r\n\r\n\x1b[1;33m[Process exited with code ${message.exitCode}]\x1b[0m\r\n`);
                  terminal.writeln('\x1b[1;36m[Reconnecting in 3 seconds...]\x1b[0m\r\n');
                }

                // Auto-reconnect after process exit
                if (mounted) {
                  reconnectTimeoutRef.current = setTimeout(() => {
                    window.location.reload();
                  }, 3000);
                }
                break;

              default:
                console.warn('[RawTerminalMode] Unknown message type:', message.type);
            }
          } catch (err) {
            console.error('[RawTerminalMode] Error parsing WebSocket message:', err);
          }
        };

        ws.onerror = (event) => {
          console.error('[RawTerminalMode] WebSocket error:', event);
          if (mounted) {
            setError('WebSocket connection error');
            setConnectionState('error');
          }
        };

        ws.onclose = (event) => {
          console.log('[RawTerminalMode] WebSocket closed:', event.code, event.reason);
          if (mounted) {
            setConnectionState('disconnected');
            if (!error && event.code !== 1000) {
              setError(`Connection closed unexpectedly (code: ${event.code})`);
            }
          }
        };

        // Handle terminal input
        terminal.onData((data) => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'input',
              data,
            }));
          }
        });

        // Handle window resize
        const handleResize = (sendToBackend = true) => {
          if (fitAddon && terminal && mounted) {
            try {
              fitAddon.fit();

              if (sendToBackend && ws && ws.readyState === WebSocket.OPEN) {
                // Small delay to ensure PTY is ready on backend
                setTimeout(() => {
                  if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                      type: 'resize',
                      cols: terminal.cols,
                      rows: terminal.rows,
                    }));
                    console.log('[RawTerminalMode] Sent resize to backend:', terminal.cols, 'x', terminal.rows);
                  }
                }, 100);
              }
            } catch (err) {
              console.error('[RawTerminalMode] Error during resize:', err);
            }
          }
        };

        window.addEventListener('resize', () => handleResize(true));

        // Initial fit - don't send to backend immediately (PTY not ready)
        setTimeout(() => handleResize(false), 150);

        // Cleanup function
        return () => {
          mounted = false;
          clearTimeout(connectionTimeout);
          window.removeEventListener('resize', handleResize);

          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
          }

          if (ws) {
            ws.close();
          }

          if (terminal) {
            terminal.dispose();
          }
        };

      } catch (err: any) {
        console.error('[RawTerminalMode] Failed to initialize terminal:', err);
        if (mounted) {
          setError(err.message || 'Failed to initialize terminal');
          setConnectionState('error');
        }
      }
    };

    initializeTerminal();

    return () => {
      mounted = false;
    };
  }, [workspaceId, projectId, getToken]);

  // Initializing state
  if (connectionState === 'initializing') {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-black text-white gap-4">
        <div className="relative">
          <div className="animate-spin h-12 w-12 border-4 border-green-500 border-t-transparent rounded-full" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-6 w-6 bg-green-500/20 rounded-full animate-pulse" />
          </div>
        </div>
        <p className="text-green-400 font-mono text-sm uppercase tracking-wider animate-pulse">
          Initializing terminal...
        </p>
      </div>
    );
  }

  // Error state
  if (connectionState === 'error' || (error && connectionState !== 'connected')) {
    const isWorkspaceError = error?.includes('Workspace') || error?.includes('workspace');

    return (
      <div className="flex flex-col items-center justify-center h-full bg-black text-white gap-6 p-8">
        <div className="text-center">
          <svg
            className="w-24 h-24 mx-auto mb-6 text-red-500 animate-pulse"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <h2 className="text-2xl font-bold mb-4 text-red-500 uppercase tracking-widest font-mono">
            {isWorkspaceError ? 'WORKSPACE ERROR' : 'CONNECTION FAILED'}
          </h2>
          <p className="text-green-300 max-w-xl mb-6 font-mono text-base leading-relaxed">
            {error}
          </p>
          {workspaceStatus && (
            <p className="text-gray-500 text-sm font-mono mb-4">
              Current workspace status: <span className="text-yellow-400">{workspaceStatus}</span>
            </p>
          )}
        </div>

        {isWorkspaceError && workspaceStatus === 'error' ? (
          <div className="bg-black border-2 border-red-500 p-6 rounded-lg max-w-2xl shadow-lg shadow-red-500/20">
            <p className="text-red-400 font-bold mb-4 uppercase tracking-wide text-base font-mono">
              ▸ REQUIRED ACTIONS:
            </p>
            <ol className="text-left list-decimal list-inside space-y-3 text-green-300 font-mono text-sm leading-relaxed">
              <li>Check workspace status indicator in the header</li>
              <li className="text-yellow-300 font-bold">Use "Force Rebuild" button to recreate the workspace</li>
              <li>Wait for workspace to reach "RUNNING" status (may take 1-2 minutes)</li>
              <li>Terminal will auto-reload once workspace is ready</li>
            </ol>
          </div>
        ) : (
          <div className="bg-black border-2 border-gray-700 p-6 rounded-lg max-w-2xl">
            <p className="text-gray-400 font-bold mb-4 uppercase tracking-wide text-sm font-mono">
              ▸ TROUBLESHOOTING:
            </p>
            <ul className="text-left list-disc list-inside space-y-2 text-gray-400 font-mono text-sm">
              <li>Backend WebSocket server (port 4001) not running</li>
              <li>Authentication token expired or invalid</li>
              <li>Network connectivity issues</li>
              <li>Firewall blocking WebSocket connections</li>
            </ul>
          </div>
        )}

        <button
          onClick={() => window.location.reload()}
          className="mt-4 px-8 py-4 bg-green-600 text-black font-bold uppercase tracking-widest text-sm border-2 border-green-600 hover:bg-green-500 hover:border-green-500 transition-all duration-200 font-mono shadow-lg shadow-green-600/50 hover:shadow-green-500/70"
        >
          ▸ RETRY CONNECTION
        </button>
      </div>
    );
  }

  // Connecting state
  if (connectionState === 'connecting') {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-black text-white gap-4">
        <div className="relative">
          <div className="animate-spin h-12 w-12 border-4 border-cyan-500 border-t-transparent rounded-full" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-6 w-6 bg-cyan-500/30 rounded-full animate-ping" />
          </div>
        </div>
        <p className="text-cyan-400 font-mono text-sm uppercase tracking-wider animate-pulse">
          Establishing connection...
        </p>
      </div>
    );
  }

  // Terminal display
  return (
    <div style={{
      height: '100%',
      width: '100%',
      backgroundColor: '#000000',
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
    }}>
      {/* Connection status indicator */}
      <div style={{
        position: 'absolute',
        top: '8px',
        right: '8px',
        zIndex: 10,
        padding: '6px 12px',
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        border: '1px solid #00ff41',
        color: '#ffffff',
        fontSize: '11px',
        fontFamily: 'monospace',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        borderRadius: '4px'
      }}>
        <div style={{ position: 'relative' }}>
          <div style={{
            width: '8px',
            height: '8px',
            backgroundColor: '#00ff41',
            borderRadius: '50%',
            animation: connectionState === 'connected' ? 'pulse 2s infinite' : 'none'
          }} />
        </div>
        <span style={{ color: '#00ff41' }}>
          {connectionState === 'connected' ? 'ONLINE' : 'OFFLINE'}
        </span>
      </div>

      {/* Terminal container - CRITICAL: Must have explicit height */}
      <div
        ref={terminalRef}
        style={{
          flex: '1 1 auto',
          width: '100%',
          height: '100%',
          minHeight: '0',
          minWidth: '0',
          padding: '8px',
          overflow: 'hidden',
          position: 'relative',
          backgroundColor: '#000000'
        }}
      />
    </div>
  );
}
