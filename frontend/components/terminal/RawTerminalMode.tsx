'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { useAuth } from '@clerk/nextjs';
import 'xterm/css/xterm.css';

interface RawTerminalModeProps {
  workspaceId: string;
  projectId: string;
}

type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';

// Module-level flag to prevent React StrictMode double initialization
// This persists across component re-renders and StrictMode cleanup cycles
let globalTerminalInitialized = false;
let initAttemptCount = 0;

export function RawTerminalMode({ workspaceId, projectId }: RawTerminalModeProps) {
  console.log('[Terminal] Component render - workspaceId:', workspaceId, 'projectId:', projectId, 'globalInit:', globalTerminalInitialized, 'attempts:', initAttemptCount);
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const isMountedRef = useRef(true);

  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const [error, setError] = useState<string | null>(null);
  const { getToken } = useAuth();

  // Callback for handling successful connection
  const handleConnected = useCallback(() => {
    console.log('[Terminal] handleConnected() called');
    console.log('[Terminal] Current state before update:', connectionState);
    console.log('[Terminal] xtermRef.current exists:', !!xtermRef.current);

    setConnectionState('connected');
    console.log('[Terminal] State updated to "connected"');

    if (xtermRef.current) {
      console.log('[Terminal] Writing welcome message to terminal');
      xtermRef.current.write('\x1b[1;33m✓ Connected to Daytona workspace via SSH\x1b[0m\r\n\r\n');
    } else {
      console.warn('[Terminal] xtermRef.current is null, cannot write welcome message');
    }
  }, [connectionState]);

  // Callback for handling terminal output
  const handleOutput = useCallback((data: number[]) => {
    if (xtermRef.current) {
      const buffer = new Uint8Array(data);
      const text = new TextDecoder().decode(buffer);
      xtermRef.current.write(text);
    }
  }, []);

  // Callback for handling errors
  const handleError = useCallback((message: string) => {
    console.error('[Terminal] Error received:', message);
    setError(message);
    setConnectionState('error');

    if (xtermRef.current) {
      xtermRef.current.writeln(`\r\n\x1b[1;31mError: ${message}\x1b[0m\r\n`);
    }
  }, []);

  // Main effect for terminal initialization
  useEffect(() => {
    initAttemptCount++;
    console.log('[Terminal] useEffect ENTRY - attempt:', initAttemptCount, 'globalInit:', globalTerminalInitialized, 'workspaceId:', workspaceId);

    // Prevent double terminal creation from React StrictMode - check BEFORE running effect
    if (globalTerminalInitialized) {
      console.log('[Terminal] Terminal already initialized globally, skipping (attempt:', initAttemptCount, ')');
      return;
    }

    console.log('[Terminal] Setting globalTerminalInitialized = true (attempt:', initAttemptCount, ')');
    globalTerminalInitialized = true;

    // CRITICAL: Set mounted flag BEFORE any async operations
    isMountedRef.current = true;
    console.log('[Terminal] Set isMountedRef.current = true');

    let terminal: Terminal | null = null;
    let fitAddon: FitAddon | null = null;
    let ws: WebSocket | null = null;
    let connectionTimeout: NodeJS.Timeout;

    const initializeTerminal = async () => {

      try {
        setConnectionState('connecting');
        setError(null);

        console.log('[Terminal] Initializing connection to workspace:', workspaceId);

        // Validate that DOM element is available
        // useLayoutEffect should guarantee this, but we add a safety check
        if (!terminalRef.current) {
          console.warn('[Terminal] Ref not available in useLayoutEffect, retrying in 50ms...');

          // Fallback: retry once after a short delay
          await new Promise(resolve => setTimeout(resolve, 50));

          if (!terminalRef.current) {
            console.error('[Terminal] Terminal container ref still null after retry');
            throw new Error('Terminal container not available - DOM element missing');
          }
        }

        console.log('[Terminal] Terminal container available:', {
          width: terminalRef.current.clientWidth,
          height: terminalRef.current.clientHeight,
          offsetWidth: terminalRef.current.offsetWidth,
          offsetHeight: terminalRef.current.offsetHeight
        });

        // Get auth token
        console.log('[Terminal] Getting auth token...');
        const token = await getToken();
        if (!token) {
          console.error('[Terminal] No auth token received');
          throw new Error('Authentication required');
        }
        console.log('[Terminal] Auth token received');

        if (!isMountedRef.current) {
          console.log('[Terminal] Component unmounted before terminal creation');
          return;
        }

        // Initialize xterm.js with Vaporform theme
        console.log('[Terminal] Creating Terminal instance...');
        terminal = new Terminal({
          cursorBlink: true,
          cursorStyle: 'block',
          fontSize: 14,
          fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", Menlo, Monaco, "Courier New", monospace',
          fontWeight: '400',
          fontWeightBold: '700',
          lineHeight: 1.2,
          theme: {
            background: '#1a1a1a',      // var(--vf-bg-primary)
            foreground: '#e5e5e5',      // var(--vf-text-primary)
            cursor: '#d4a574',          // var(--vf-accent-primary) - tan
            cursorAccent: '#1a1a1a',
            selectionBackground: 'rgba(212, 165, 116, 0.3)',
            selectionForeground: '#e5e5e5',
            black: '#000000',
            red: '#ff6b6b',
            green: '#51cf66',
            yellow: '#ffd43b',
            blue: '#339af0',
            magenta: '#cc5de8',
            cyan: '#22b8cf',
            white: '#e5e5e5',
            brightBlack: '#555555',
            brightRed: '#ff9999',
            brightGreen: '#88ff88',
            brightYellow: '#ffee99',
            brightBlue: '#6699ff',
            brightMagenta: '#ff99ff',
            brightCyan: '#66ffff',
            brightWhite: '#ffffff',
          },
          scrollback: 10000,
          convertEol: true,
          allowProposedApi: true,
        });

        fitAddon = new FitAddon();
        terminal.loadAddon(fitAddon);

        // Attach terminal to DOM
        console.log('[Terminal] Attaching terminal to DOM element');
        terminal.open(terminalRef.current);
        console.log('[Terminal] Terminal opened successfully');

        xtermRef.current = terminal;
        fitAddonRef.current = fitAddon;

        // Single delayed fit after DOM settles
        setTimeout(() => {
          if (fitAddon && isMountedRef.current) {
            try {
              fitAddon.fit();
              console.log('[Terminal] Initial fit to:', terminal.cols, 'x', terminal.rows);
            } catch (err) {
              console.error('[Terminal] Fit error:', err);
            }
          }
        }, 300);

        // Connect to SSH Terminal WebSocket (port 4003)
        // Use current hostname to support both localhost and LAN access
        const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
        const cols = terminal?.cols || 120;
        const rows = terminal?.rows || 30;
        const wsUrl = `ws://${hostname}:4003?projectId=${projectId}&token=${token}&cols=${cols}&rows=${rows}`;

        console.log('[Terminal] Connecting to SSH Terminal WebSocket');
        console.log('[Terminal] WS URL:', wsUrl);
        console.log('[Terminal] Terminal dimensions:', cols, 'x', rows);

        ws = new WebSocket(wsUrl);
        wsRef.current = ws;
        console.log('[Terminal] WebSocket instance created, readyState:', ws.readyState);

        connectionTimeout = setTimeout(() => {
          if (ws && ws.readyState !== WebSocket.OPEN) {
            console.error('[Terminal] Connection timeout');
            ws.close();
            if (isMountedRef.current) {
              setError('Connection timeout. Backend may not be running.');
              setConnectionState('error');
            }
          }
        }, 10000);

        ws.onopen = () => {
          clearTimeout(connectionTimeout);
          console.log('[Terminal] WebSocket connected, waiting for SSH session...');
          // Keep state as 'connecting' until SSH session is established
        };

        ws.onmessage = (event) => {
          console.log('[Terminal] WS message received, isMounted:', isMountedRef.current);
          if (!isMountedRef.current) {
            console.log('[Terminal] Ignoring message - component unmounted');
            return;
          }

          try {
            const message = JSON.parse(event.data);
            console.log('[Terminal] Parsed message type:', message.type);

            switch (message.type) {
              case 'connected':
                console.log('[Terminal] Received "connected" message, calling handleConnected()');
                handleConnected();
                break;

              case 'output':
                if (message.data) {
                  console.log('[Terminal] Received output data, length:', message.data.length);
                  handleOutput(message.data);
                }
                break;

              case 'error':
                console.log('[Terminal] Received error message:', message.message);
                handleError(message.message);
                break;

              default:
                console.warn('[Terminal] Unknown message type:', message.type);
            }
          } catch (err) {
            console.error('[Terminal] Error parsing WebSocket message:', err);
          }
        };

        ws.onerror = (event) => {
          console.error('[Terminal] WebSocket error:', event);
          if (isMountedRef.current) {
            setError('WebSocket connection error');
            setConnectionState('error');
          }
        };

        ws.onclose = (event) => {
          console.log('[Terminal] WebSocket closed:', event.code, event.reason);
          if (isMountedRef.current) {
            setConnectionState('disconnected');
            if (event.code !== 1000) {
              setError(`Connection closed (code: ${event.code})`);
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

        // Handle resize
        const handleResize = () => {
          if (fitAddon && terminal && isMountedRef.current) {
            try {
              fitAddon.fit();

              if (ws && ws.readyState === WebSocket.OPEN) {
                setTimeout(() => {
                  if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                      type: 'resize',
                      cols: terminal.cols,
                      rows: terminal.rows,
                    }));
                    console.log('[Terminal] Resized to:', terminal.cols, 'x', terminal.rows);
                  }
                }, 100);
              }
            } catch (err) {
              console.error('[Terminal] Error during resize:', err);
            }
          }
        };

        window.addEventListener('resize', handleResize);

        // Add ResizeObserver to detect panel resize (when user drags panel handles)
        const resizeObserver = new ResizeObserver(() => {
          handleResize();
        });

        if (terminalRef.current) {
          resizeObserver.observe(terminalRef.current);
        }

        // Cleanup function
        return () => {
          console.log('[Terminal] Inner cleanup function called');
          isMountedRef.current = false;
          clearTimeout(connectionTimeout);
          window.removeEventListener('resize', handleResize);
          resizeObserver.disconnect();

          if (ws) {
            console.log('[Terminal] Closing WebSocket');
            ws.close();
          }

          if (terminal) {
            console.log('[Terminal] Disposing terminal');
            terminal.dispose();
          }
        };

      } catch (err: any) {
        console.error('[Terminal] Failed to initialize:', err);
        console.error('[Terminal] Error stack:', err.stack);
        if (isMountedRef.current) {
          setError(err.message || 'Failed to initialize terminal');
          setConnectionState('error');
        }
      }
    };

    console.log('[Terminal] Calling initializeTerminal()');
    initializeTerminal();

    // NO CLEANUP FUNCTION - let the inner cleanup from initializeTerminal handle everything
    // Returning a cleanup here causes StrictMode to set isMountedRef = false
    // BEFORE the async initializeTerminal completes, aborting initialization
  }, [workspaceId, projectId, getToken, handleConnected, handleOutput, handleError]);

  // Always render the terminal container with ref attached
  // Overlay loading/error states on top
  return (
    <div style={{
      height: '100%',
      width: '100%',
      backgroundColor: '#1a1a1a',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Connection status indicator */}
      <div style={{
        position: 'absolute',
        top: '4px',
        right: '4px',
        zIndex: 10,
        padding: '4px 10px',
        backgroundColor: 'rgba(26, 26, 26, 0.9)',
        border: connectionState === 'connected' ? '1px solid var(--vf-accent-success)' : '1px solid var(--vf-border-primary)',
        color: 'var(--vf-text-secondary)',
        fontSize: '10px',
        fontFamily: 'var(--vf-font-mono)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        display: 'flex',
        alignItems: 'center',
        gap: '6px'
      }}>
        <div style={{
          width: '6px',
          height: '6px',
          backgroundColor: connectionState === 'connected' ? 'var(--vf-accent-success)' : 'var(--vf-text-muted)',
          borderRadius: '50%'
        }} />
        {connectionState === 'connected' ? 'CONNECTED' : 'DISCONNECTED'}
      </div>

      {/* Connecting overlay */}
      {connectionState === 'connecting' && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 20,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '16px',
          backgroundColor: 'var(--vf-bg-primary)',
          color: 'var(--vf-text-primary)',
          fontFamily: 'var(--vf-font-mono)'
        }}>
          <div style={{
            width: '48px',
            height: '48px',
            border: '3px solid var(--vf-accent-primary)',
            borderTop: '3px solid transparent',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }} />
          <p style={{
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: 'var(--vf-accent-primary)',
            fontSize: '12px'
          }}>
            CONNECTING TO TERMINAL...
          </p>
        </div>
      )}

      {/* Error overlay */}
      {(connectionState === 'error' || (error && connectionState !== 'connected')) && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 20,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '16px',
          padding: '32px',
          backgroundColor: 'var(--vf-bg-primary)',
          color: 'var(--vf-text-primary)',
          fontFamily: 'var(--vf-font-mono)'
        }}>
          <div style={{
            width: '48px',
            height: '48px',
            border: '3px solid var(--vf-accent-danger)',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '24px'
          }}>
            ⚠
          </div>
          <h2 style={{
            fontSize: '18px',
            fontWeight: 'bold',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: 'var(--vf-accent-danger)',
            margin: 0
          }}>
            CONNECTION FAILED
          </h2>
          <p style={{
            maxWidth: '400px',
            textAlign: 'center',
            margin: 0,
            color: 'var(--vf-text-secondary)'
          }}>
            {error}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '16px',
              padding: '12px 24px',
              backgroundColor: 'var(--vf-accent-primary)',
              color: '#000000',
              border: '2px solid var(--vf-accent-primary)',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              cursor: 'pointer',
              fontFamily: 'var(--vf-font-mono)',
              fontSize: '12px'
            }}
          >
            RETRY
          </button>
        </div>
      )}

      {/* Terminal container - ALWAYS RENDERED so ref is available */}
      <div
        ref={terminalRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          padding: '0',
          overflow: 'hidden'
        }}
      />

      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
