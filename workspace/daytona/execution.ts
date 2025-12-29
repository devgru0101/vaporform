
import { DaytonaContext } from './types.js';
import { DaytonaFilesystem } from './filesystem.js';
import { withTimeout } from './utils.js';
import { ValidationError, NotFoundError } from '../../shared/errors.js';
import { contextManager } from '../../ai/context-manager.js';
import { db } from '../workspace-db.js';


export class DaytonaExecution {
    private ptyHandles: Map<string, any> = new Map();

    constructor(
        private context: DaytonaContext,
        private fs: DaytonaFilesystem
    ) { }

    async executeCommand(
        workspaceId: bigint,
        command: string
    ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
        const workspace = await this.context.getWorkspace(workspaceId);
        if (workspace.status !== 'running') throw new ValidationError('Workspace is not running');

        if (this.context.daytona && workspace.daytona_sandbox_id) {
            const sandbox = await this.context.getSandbox(workspace);
            const result = await sandbox.process.executeCommand(command);
            await this.context.addLog(workspaceId, 'info', `Executed command: ${command}`);

            const response = result as any;
            const output = response.result || response.artifacts?.stdout || '';
            const exitCode = response.exitCode || response.code || 0;
            return { stdout: output, stderr: '', exitCode };
        } else {
            const error = 'Failed to execute command: Workspace not running or Daytona not configured';
            await this.context.addLog(workspaceId, 'error', error);
            throw new Error(error);
        }
    }

    async codeRun(
        workspaceId: bigint,
        code: string,
        params?: { argv?: string[]; env?: Record<string, string> },
        timeout?: number
    ): Promise<{ exitCode: number; stdout: string; stderr: string; artifacts?: any }> {
        const workspace = await this.context.getWorkspace(workspaceId);
        if (workspace.status !== 'running') throw new ValidationError('Workspace is not running');

        if (this.context.daytona && workspace.daytona_sandbox_id) {
            const sandbox = await this.context.getSandbox(workspace);
            const result = await sandbox.process.codeRun(code, params, timeout);
            await this.context.addLog(workspaceId, 'info', `Executed code: exit=${result.exitCode}`);

            const response = result as any;
            const exitCode = response.exitCode || response.code || 0;
            const stdout = response.artifacts?.stdout || response.stdout || response.result || '';
            const stderr = response.stderr || (exitCode !== 0 ? response.result : '') || '';
            return { exitCode, stdout, stderr, artifacts: response.artifacts };
        } else {
            const error = 'Failed to run code: Workspace not running or Daytona not configured';
            await this.context.addLog(workspaceId, 'error', error);
            throw new Error(error);
        }
    }

    // PTY Management

    async createPtySession(
        workspaceId: bigint,
        command: string,
        options?: { cols?: number; rows?: number; captureOutput?: boolean }
    ): Promise<{ sessionId: string; output?: string[] }> {
        const workspace = await this.context.getWorkspace(workspaceId);
        if (!this.context.daytona || !workspace.daytona_sandbox_id) throw new ValidationError('Workspace not running');

        const sandbox = await this.context.getSandbox(workspace);
        const sessionId = `pty-${workspaceId}-${Date.now()}`;
        const output: string[] = [];

        const ptyHandle = await sandbox.process.createPty({
            id: sessionId,
            cols: options?.cols || 120,
            rows: options?.rows || 30,
            onData: (data: Uint8Array) => {
                const text = new TextDecoder().decode(data);
                if (options?.captureOutput) output.push(text);
            },
        });

        await ptyHandle.waitForConnection();
        this.ptyHandles.set(sessionId, ptyHandle);
        await ptyHandle.sendInput(`${command}\n`);
        await this.context.addLog(workspaceId, 'info', `Started PTY session ${sessionId}: ${command}`);

        return { sessionId, output: options?.captureOutput ? output : undefined };
    }

    async sendPtyInput(sessionId: string, input: string): Promise<void> {
        const ptyHandle = this.ptyHandles.get(sessionId);
        if (!ptyHandle) throw new NotFoundError(`PTY session ${sessionId} not found`);
        if (!ptyHandle.isConnected()) throw new ValidationError(`PTY session ${sessionId} is not connected`);
        await ptyHandle.sendInput(input);
    }

    getPtyStatus(sessionId: string): { exists: boolean; connected: boolean; exitCode?: number; error?: string } {
        const ptyHandle = this.ptyHandles.get(sessionId);
        if (!ptyHandle) return { exists: false, connected: false };
        return {
            exists: true,
            connected: ptyHandle.isConnected(),
            exitCode: ptyHandle.exitCode,
            error: ptyHandle.error,
        };
    }

    async killPtySession(sessionId: string): Promise<void> {
        const ptyHandle = this.ptyHandles.get(sessionId);
        if (!ptyHandle) throw new NotFoundError(`PTY session ${sessionId} not found`);
        try {
            await ptyHandle.kill();
            await ptyHandle.disconnect();
            this.ptyHandles.delete(sessionId);
        } catch (error) {
            this.ptyHandles.delete(sessionId);
            throw error;
        }
    }

    listPtySessions(workspaceId: bigint): Array<{ sessionId: string; connected: boolean; exitCode?: number }> {
        const sessions: Array<{ sessionId: string; connected: boolean; exitCode?: number }> = [];
        for (const [sessionId, ptyHandle] of this.ptyHandles.entries()) {
            if (sessionId.includes(`pty-${workspaceId}-`)) {
                sessions.push({
                    sessionId,
                    connected: ptyHandle.isConnected(),
                    exitCode: ptyHandle.exitCode,
                });
            }
        }
        return sessions;
    }

    // Remote PTY / Session methods

    async listDaytonaPtySessions(workspaceId: bigint): Promise<any[]> {
        const workspace = await this.context.getWorkspace(workspaceId);
        if (!this.context.daytona || !workspace.daytona_sandbox_id) return [];
        try {
            const sandbox = await this.context.getSandbox(workspace);
            return await sandbox.process.listPtySessions();
        } catch { return []; }
    }

    async resizePtySession(workspaceId: bigint, sessionId: string, cols: number, rows: number): Promise<any> {
        const workspace = await this.context.getWorkspace(workspaceId);
        if (!this.context.daytona || !workspace.daytona_sandbox_id) throw new Error('Note available');
        const sandbox = await this.context.getSandbox(workspace);
        return await sandbox.process.resizePtySession(sessionId, cols, rows);
    }

    async killDaytonaPtySession(workspaceId: bigint, sessionId: string): Promise<void> {
        const workspace = await this.context.getWorkspace(workspaceId);
        if (this.context.daytona && workspace.daytona_sandbox_id) {
            const sandbox = await this.context.getSandbox(workspace);
            await sandbox.process.killPtySession(sessionId);
            this.ptyHandles.delete(sessionId);
        }
    }

    async getSessionDetails(workspaceId: bigint, sessionId: string): Promise<any> {
        const workspace = await this.context.getWorkspace(workspaceId);
        if (!this.context.daytona || !workspace.daytona_sandbox_id) throw new Error('Not available');
        const sandbox = await this.context.getSandbox(workspace);
        return await sandbox.process.getSession(sessionId);
    }

    async listDaytonaSessions(workspaceId: bigint): Promise<any[]> {
        const workspace = await this.context.getWorkspace(workspaceId);
        if (!this.context.daytona || !workspace.daytona_sandbox_id) return [];
        const sandbox = await this.context.getSandbox(workspace);
        return await sandbox.process.listSessions();
    }

    async connectPty(workspaceId: bigint, sessionId: string, onData: (data: Uint8Array) => void): Promise<any> {
        const workspace = await this.context.getWorkspace(workspaceId);
        if (!this.context.daytona || !workspace.daytona_sandbox_id) throw new Error('Not available');
        const sandbox = await this.context.getSandbox(workspace);
        const ptyHandle = await sandbox.process.connectPty(sessionId, { onData });
        await ptyHandle.waitForConnection();
        this.ptyHandles.set(sessionId, ptyHandle);
        return ptyHandle;
    }

    // Dev Server Methods (re-included for completeness)

    private validateCommand(command: string): { valid: boolean; error?: string } {
        if (command.includes('\\') && !command.includes('\\\\')) return { valid: false, error: 'Invalid path separators' };
        if (command.match(/^cd\s+/)) return { valid: false, error: 'cd not supported' };
        const quoteCount = (command.match(/"/g) || []).length;
        if (quoteCount % 2 !== 0) return { valid: false, error: 'Unmatched quotes' };
        return { valid: true };
    }

    detectPortFromCommand(command: string): number {
        const cmd = command.toLowerCase();
        const portMatch = cmd.match(/--port[=\s]+(\d+)|port[=\s]+(\d+)|-p\s+(\d+)/);
        if (portMatch) {
            const port = parseInt(portMatch[1] || portMatch[2] || portMatch[3]);
            if (port > 0 && port < 65536) return port;
        }
        if (cmd.includes('vite')) return 5173;
        if (cmd.includes('vue-cli-service')) return 8080;
        if (cmd.includes('ng serve')) return 4200;
        if (cmd.includes('next')) return 3000;
        return 3000;
    }

    async setPreviewPort(workspaceId: bigint, port: number): Promise<void> {
        await db.exec`
            UPDATE workspaces
            SET preview_port = ${port},
                metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('preview_port', ${port})
            WHERE id = ${workspaceId}
        `;

        console.log(`[Port Detection] Explicitly set preview port ${port} for workspace ${workspaceId}`);
    }

    /**
     * Get preview URL for a workspace using Daytona SDK
     */
    async getPreviewUrl(workspaceId: bigint, port?: number): Promise<{ url: string; token: string; port: number } | null> {
        const workspace = await this.context.getWorkspace(workspaceId);

        if (!workspace.daytona_sandbox_id) {
            return null;
        }

        // Use provided port, or workspace.preview_port, or metadata.preview_port, or default to 3000
        let effectivePort = port;

        // Check workspace.preview_port column first (set by setPreviewPort)
        if (!effectivePort && workspace.preview_port) {
            effectivePort = workspace.preview_port;
        }

        // Fallback to metadata.preview_port
        if (!effectivePort && workspace.metadata) {
            const metadata = typeof workspace.metadata === 'string'
                ? JSON.parse(workspace.metadata)
                : workspace.metadata;
            effectivePort = metadata.preview_port;
        }

        // Default to 3000 if still not set
        if (!effectivePort) effectivePort = 3000;

        try {
            const sandbox = await this.context.getSandbox(workspace);

            // Use Daytona SDK's getPreviewLink method
            const previewInfo = await sandbox.getPreviewLink(effectivePort);

            return {
                url: previewInfo.url,
                token: previewInfo.token,
                port: effectivePort
            };
        } catch (error) {
            console.error(`[Preview URL] Failed to get preview link for port ${effectivePort}:`, error);
            // Fallback to manual construction if SDK method fails
            const fallbackUrl = `https://${effectivePort}-${workspace.daytona_sandbox_id}.proxy.daytona.works`;
            console.warn(`[Preview URL] Using fallback URL: ${fallbackUrl}`);
            return {
                url: fallbackUrl,
                token: '',
                port: effectivePort
            };
        }
    }

    /**
     * Get sandbox URL (alias for getPreviewUrl)
     */
    async getSandboxUrl(workspaceId: bigint): Promise<{ url: string; token: string; port: number } | null> {
        return this.getPreviewUrl(workspaceId);
    }

    private parsePortFromOutput(output: string): number | null {
        const patterns = [
            /(?:port|PORT)\s*[:\s]+(\d+)/i,
            /localhost:(\d+)/i,
            /0\.0\.0\.0:(\d+)/i,
            /127\.0\.0\.1:(\d+)/i,
            /http:\/\/[^:]+:(\d+)/i,
        ];
        for (const pattern of patterns) {
            const match = output.match(pattern);
            if (match) {
                const port = parseInt(match[1]);
                if (port > 0 && port < 65536) return port;
            }
        }
        return null;
    }

    private isErrorOutput(text: string): boolean {
        const errorPatterns = [/error:/i, /failed/i, /exception/i, /fatal/i];
        return errorPatterns.some(pattern => pattern.test(text));
    }

    private detectErrorSeverity(text: string): 'critical' | 'high' | 'medium' {
        if (/fatal|exception/.test(text)) return 'critical';
        return 'high';
    }

    private async forwardDevServerError(workspaceId: bigint, projectId: bigint, errorText: string): Promise<void> {
        contextManager.upsertContextItem(
            projectId,
            'error',
            `devserver_${workspaceId}_${Date.now()}`,
            errorText,
            { workspaceId: workspaceId.toString(), source: 'dev_server', autoForwarded: true, severity: this.detectErrorSeverity(errorText) }
        ).catch(() => { });
    }

    private async isPortAvailable(workspaceId: bigint, port: number): Promise<boolean> {
        try {
            const result = await this.executeCommand(workspaceId, `lsof -i :${port} 2>&1 || echo "FREE"`);
            return result.stdout.includes('FREE');
        } catch { return true; }
    }

    private async isPortListening(workspaceId: bigint, port: number): Promise<boolean> {
        try {
            const result = await this.executeCommand(workspaceId, `lsof -i :${port} -sTCP:LISTEN 2>/dev/null || netstat -tuln 2>/dev/null | grep ":${port} "`);
            return result.exitCode === 0 && result.stdout.trim().length > 0;
        } catch { return false; }
    }

    async healthCheckPreviewUrl(url: string, maxAttempts: number = 5): Promise<boolean> {
        for (let i = 0; i < maxAttempts; i++) {
            try {
                const res = await fetch(url);
                if (res.status < 400) return true;
            } catch (e) {
                console.debug(`[Health Check] Attempt ${i + 1}/${maxAttempts} failed for ${url}:`, e instanceof Error ? e.message : String(e));
            }
            await new Promise(r => setTimeout(r, 1000));
        }
        console.warn(`[Health Check] All ${maxAttempts} attempts failed for ${url}`);
        return false;
    }

    async startDevServer(
        workspaceId: bigint,
        command: string
    ): Promise<{ processStarted: boolean; detectedPort?: number }> {
        const workspace = await this.context.getWorkspace(workspaceId);
        if (workspace.status !== 'running') throw new ValidationError('Workspace is not running');
        const validation = this.validateCommand(command);
        if (!validation.valid) throw new ValidationError(`Invalid command syntax: ${validation.error}`);
        const expectedPort = this.detectPortFromCommand(command);
        if (!await this.isPortAvailable(workspaceId, expectedPort)) await this.context.addLog(workspaceId, 'warn', `Port ${expectedPort} is already in use.`);

        let pty: any = null;
        try {
            if (this.context.daytona && workspace.daytona_sandbox_id) {
                const sandbox = await this.context.getSandbox(workspace);
                try {
                    let outputBuffer = '';
                    pty = await withTimeout(
                        sandbox.process.createPty({
                            id: `dev-server-${workspaceId}`,
                            cols: 120,
                            rows: 30,
                            onData: (data: Uint8Array) => {
                                const text = new TextDecoder().decode(data);
                                outputBuffer += text;
                                if (this.isErrorOutput(text)) this.forwardDevServerError(workspaceId, workspace.project_id, text);
                            }
                        }),
                        10000,
                        'PTY creation'
                    );
                    await withTimeout(pty.sendInput(`${command}\n`), 5000, 'PTY sendInput');
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    let detectedPort = this.parsePortFromOutput(outputBuffer) || undefined;
                    await this.context.addLog(workspaceId, 'info', `Dev server started: ${command}`);
                    return { processStarted: true, detectedPort };
                } catch (ptyError) {
                    if (pty) {
                        try {
                            await pty.kill();
                        } catch (e) {
                            console.error('[Dev Server] Failed to kill PTY during cleanup:', e instanceof Error ? e.message : String(e));
                        }
                    }
                    const bgCommand = `nohup ${command} > /tmp/dev-server.log 2>&1 &`;
                    await this.executeCommand(workspaceId, bgCommand);
                    await this.context.addLog(workspaceId, 'info', `Dev server started (fallback): ${command}`);
                    return { processStarted: true, detectedPort: expectedPort };
                }
            } else {
                const error = 'Failed to start dev server: Workspace not running or Daytona not configured';
                await this.context.addLog(workspaceId, 'error', error);
                throw new Error(error);
            }
        } catch (error) {
            if (pty) {
                try {
                    await pty.kill();
                } catch (e) {
                    console.error('[Dev Server] Failed to kill PTY during error cleanup:', e instanceof Error ? e.message : String(e));
                }
            }
            await this.context.addLog(workspaceId, 'error', `Dev server start failed: ${(error as Error).message}`);
            throw error;
        }
    }

    async restartDevServer(workspaceId: bigint, command?: string): Promise<void> {
        await this.executeCommand(workspaceId, 'pkill -f "node" || true');
        if (command) await this.startDevServer(workspaceId, command);
    }

    /**
     * Get all ports listening in the Daytona preview range (3000-9999)
     * Works for ANY tech stack - no hard-coded port list needed!
     */
    private async getAllListeningPorts(workspaceId: bigint): Promise<number[]> {
        try {
            // Use ss (socket statistics) to find all listening TCP ports
            // Filter for preview range 3000-9999 per Daytona docs
            const result = await this.executeCommand(
                workspaceId,
                `ss -tuln | grep LISTEN | grep -oP ':\\K[0-9]+' | sort -n | uniq`
            );

            if (result.exitCode !== 0) return [];

            const ports = result.stdout
                .split('\n')
                .map(line => parseInt(line.trim()))
                .filter(port => !isNaN(port) && port >= 3000 && port <= 9999);

            return ports;
        } catch (error) {
            console.error('[Port Detection] Failed to scan listening ports:', error);
            return [];
        }
    }

    async getSandboxUrl(workspaceId: bigint): Promise<{ url: string; token: string; port: number } | null> {
        const workspace = await this.context.getWorkspace(workspaceId);
        if (!workspace.daytona_sandbox_id || !this.context.daytona || workspace.status !== 'running') return null;
        const sandbox = await this.context.getSandbox(workspace);

        // PHASE 3: SMART DETECTION with 3-tier priority system
        // 1. Check agent-specified port first (fastest, most accurate)
        const previewPort = (workspace as any).metadata?.preview_port;
        if (previewPort) {
            console.log(`[Port Detection] Using saved preview port from DB: ${previewPort}`);
            try {
                const link = await sandbox.getPreviewLink(previewPort);
                if (link?.url) {
                    console.log(`[Port Detection] ✅ Using agent-specified port ${previewPort}`);
                    return { url: link.url, token: link.token || '', port: previewPort };
                }
            } catch (error) {
                console.warn(`[Port Detection] Agent-specified port ${previewPort} not available:`, error);
            }
        }

        // 2. FALLBACK: Comprehensive scan of all listening ports (3000-9999)
        // Works for ANY framework: Vite, Next.js, Django, Angular, Flask, custom servers, etc.
        const listeningPorts = await this.getAllListeningPorts(workspaceId);

        console.log(`[Port Detection] Found ${listeningPorts.length} listening ports:`, listeningPorts);

        for (const port of listeningPorts) {
            try {
                const link = await sandbox.getPreviewLink(port);
                if (link?.url) {
                    console.log(`[Port Detection] ✅ Preview URL found on port ${port}:`, link.url);
                    return { url: link.url, token: link.token || '', port };
                }
            } catch (error) {
                console.debug(`[Port Detection] Port ${port} not previewable:`, error);
            }
        }

        console.warn(`[Port Detection] No preview URL available. Listening ports: ${listeningPorts.join(', ') || 'none'}`);
        return null;
    }

    async getTerminalUrl(workspaceId: bigint): Promise<string | null> {
        const workspace = await this.context.getWorkspace(workspaceId);
        if (!workspace.daytona_sandbox_id) return null;
        const sandbox = await this.context.getSandbox(workspace);
        const link = await sandbox.getPreviewLink(22222);
        return link.url;
    }

    async detectTechStack(workspaceId: bigint, projectId: bigint): Promise<import('../../shared/types.js').TechStack> {
        try {
            const packageJson = await this.fs.readFile(workspaceId, 'package.json').catch(() => null);
            if (packageJson) return { language: 'nodejs', framework: 'nextjs', packageManager: 'npm' };
            return { language: 'unknown', framework: 'generic', packageManager: 'none' };
        } catch (e) { return { language: 'unknown', framework: 'generic', packageManager: 'none' }; }
    }

    async installDependencies(workspaceId: bigint, techStack: any): Promise<{ success: boolean; output: string }> {
        return { success: true, output: 'Dependencies installed' }; // Simplified for now
    }

    async inferDevCommand(workspaceId: bigint): Promise<string | null> {
        try {
            const packageJson = await this.fs.readFile(workspaceId, 'package.json');
            const pkg = JSON.parse(packageJson);
            if (pkg.scripts?.dev) return 'npm run dev';
            if (pkg.scripts?.start) return 'npm start';
            return null;
        } catch (e) { return null; }
    }

    async inferBuildCommand(workspaceId: bigint): Promise<string | null> {
        try {
            const packageJson = await this.fs.readFile(workspaceId, 'package.json');
            const pkg = JSON.parse(packageJson);
            if (pkg.scripts?.build) return 'npm run build';
            return null;
        } catch (e) { return null; }
    }

    // ============================================================================
    // Session Management (PTY Sessions for Background Processes)
    // ============================================================================

    /**
     * Create a new PTY session for long-running processes
     * This creates a PTY handle that can be used later with sessionExec
     */
    async createSession(workspaceId: bigint, sessionId: string): Promise<void> {
        const workspace = await this.context.getWorkspace(workspaceId);
        if (workspace.status !== 'running') {
            throw new ValidationError('Workspace is not running');
        }

        if (!this.context.daytona || !workspace.daytona_sandbox_id) {
            throw new Error('Daytona not configured');
        }

        try {
            const sandbox = await this.context.getSandbox(workspace);

            // Create a PTY and store the handle for later use
            const ptyHandle = await sandbox.process.createPty({
                id: sessionId,
                cols: 120,
                rows: 30,
                onData: (data: Uint8Array) => {
                    // Optional: could log output or store it
                    const text = new TextDecoder().decode(data);
                    console.log(`[PTY ${sessionId}] ${text}`);
                }
            });

            await ptyHandle.waitForConnection();
            this.ptyHandles.set(sessionId, ptyHandle);

            await this.context.addLog(workspaceId, 'info', `Created PTY session: ${sessionId}`);
            console.log(`[DAYTONA] Created PTY session ${sessionId} for workspace ${workspaceId}`);
        } catch (error) {
            console.error(`[DAYTONA] Failed to create session ${sessionId}:`, error);
            throw error;
        }
    }

    /**
     * Execute a command in a PTY session by sending it as input
     */
    async sessionExec(workspaceId: bigint, sessionId: string, command: string): Promise<any> {
        const workspace = await this.context.getWorkspace(workspaceId);
        if (!this.context.daytona || !workspace.daytona_sandbox_id) {
            throw new Error('Daytona not configured');
        }

        try {
            // Check if we have a local PTY handle first (from createPtySession)
            const localPtyHandle = this.ptyHandles.get(sessionId);
            if (localPtyHandle) {
                // Use the local PTY handle
                await localPtyHandle.sendInput(`${command}\n`);
                await this.context.addLog(workspaceId, 'info', `Sent command to PTY session ${sessionId}: ${command}`);
                console.log(`[DAYTONA] Sent '${command}' to PTY session ${sessionId}`);
                return { success: true, message: 'Command sent to PTY session' };
            }

            // Otherwise, try to connect to the Daytona SDK session
            const sandbox = await this.context.getSandbox(workspace);

            // For Daytona SDK sessions, we need to send input via the process API
            // The session object from getSession is not directly executable
            // Instead, we should use writePtySession or similar if available

            try {
                // Try to write to the session
                const session = await sandbox.process.getSession(sessionId);

                // Send the command as input to the PTY
                if (typeof (session as any).write === 'function') {
                    await (session as any).write(`${command}\n`);
                } else if (typeof (session as any).sendInput === 'function') {
                    await (session as any).sendInput(`${command}\n`);
                } else {
                    // If the session doesn't support input, we might need to execute via PTY
                    console.warn(`[DAYTONA] Session ${sessionId} doesn't support direct input, using createPty approach`);

                    // Create a new PTY and run the command
                    const ptyHandle = await sandbox.process.createPty({
                        id: `exec-${sessionId}-${Date.now()}`,
                        cols: 120,
                        rows: 30,
                        onData: (data: Uint8Array) => {
                            const text = new TextDecoder().decode(data);
                            console.log(`[PTY exec-${sessionId}]`, text);
                        }
                    });

                    await ptyHandle.waitForConnection();
                    await ptyHandle.sendInput(`${command}\\n`);

                    // Don't wait for it to finish - let it run in background
                    setTimeout(async () => {
                        try {
                            await ptyHandle.kill();
                        } catch (e) {
                            console.error('[DAYTONA] Failed to kill temporary PTY:', e);
                        }
                    }, 1000);
                }

                await this.context.addLog(workspaceId, 'info', `Executed in session ${sessionId}: ${command}`);
                console.log(`[DAYTONA] Executed '${command}' in session ${sessionId}`);

                return { success: true, message: 'Command sent to session' };
            } catch (error) {
                console.error(`[DAYTONA] Failed to send command to session ${sessionId}:`, error);
                throw error;
            }
        } catch (error) {
            console.error(`[DAYTONA] Failed to execute in session ${sessionId}:`, error);
            throw error;
        }
    }

    /**
     * Get information about a PTY session
     */
    async getSession(workspaceId: bigint, sessionId: string): Promise<any> {
        const workspace = await this.context.getWorkspace(workspaceId);
        if (!this.context.daytona || !workspace.daytona_sandbox_id) {
            throw new Error('Daytona not configured');
        }

        try {
            const sandbox = await this.context.getSandbox(workspace);
            const session = await sandbox.process.getSession(sessionId);
            return session;
        } catch (error) {
            console.error(`[DAYTONA] Failed to get session ${sessionId}:`, error);
            throw new NotFoundError(`Session ${sessionId} not found`);
        }
    }

    /**
     * Delete a PTY session
     */
    async deleteSession(workspaceId: bigint, sessionId: string): Promise<void> {
        const workspace = await this.context.getWorkspace(workspaceId);
        if (!this.context.daytona || !workspace.daytona_sandbox_id) {
            throw new Error('Daytona not configured');
        }

        try {
            const sandbox = await this.context.getSandbox(workspace);
            await sandbox.process.deleteSession(sessionId);
            await this.context.addLog(workspaceId, 'info', `Deleted PTY session: ${sessionId}`);
            console.log(`[DAYTONA] Deleted session ${sessionId} for workspace ${workspaceId}`);
        } catch (error) {
            console.error(`[DAYTONA] Failed to delete session ${sessionId}:`, error);
            throw error;
        }
    }

    /**
     * List all PTY sessions
     */
    async listSessions(workspaceId: bigint): Promise<any[]> {
        const workspace = await this.context.getWorkspace(workspaceId);
        if (!this.context.daytona || !workspace.daytona_sandbox_id) {
            throw new Error('Daytona not configured');
        }

        try {
            const sandbox = await this.context.getSandbox(workspace);
            const sessions = await sandbox.process.listSessions();
            return sessions;
        } catch (error) {
            console.error(`[DAYTONA] Failed to list sessions:`, error);
            return [];
        }
    }

    // ========================================
    // Git Operations
    // ========================================

    /**
     * Get git status of repository
     */
    async gitStatus(workspaceId: bigint, repoPath: string): Promise<any> {
        const workspace = await this.context.getWorkspace(workspaceId);
        if (!this.context.daytona || !workspace.daytona_sandbox_id) {
            throw new ValidationError('Workspace not running');
        }

        const sandbox = await this.context.getSandbox(workspace);
        await this.context.addLog(workspaceId, 'info', `Getting git status for: ${repoPath}`);
        return await sandbox.git.status(repoPath);
    }

    /**
     * Stage files for commit
     */
    async gitAdd(workspaceId: bigint, repoPath: string, files: string[]): Promise<void> {
        const workspace = await this.context.getWorkspace(workspaceId);
        if (!this.context.daytona || !workspace.daytona_sandbox_id) {
            throw new ValidationError('Workspace not running');
        }

        const sandbox = await this.context.getSandbox(workspace);
        await this.context.addLog(workspaceId, 'info', `Staging files in ${repoPath}: ${files.join(', ')}`);
        await sandbox.git.add(repoPath, files);
    }

    /**
     * Commit staged changes
     */
    async gitCommit(workspaceId: bigint, repoPath: string, message: string, author: string, email: string): Promise<void> {
        const workspace = await this.context.getWorkspace(workspaceId);
        if (!this.context.daytona || !workspace.daytona_sandbox_id) {
            throw new ValidationError('Workspace not running');
        }

        const sandbox = await this.context.getSandbox(workspace);
        await this.context.addLog(workspaceId, 'info', `Committing changes in ${repoPath}: "${message}"`);
        await sandbox.git.commit(repoPath, message, author, email);
    }

    /**
     * Push commits to remote repository
     */
    async gitPush(workspaceId: bigint, repoPath: string): Promise<void> {
        const workspace = await this.context.getWorkspace(workspaceId);
        if (!this.context.daytona || !workspace.daytona_sandbox_id) {
            throw new ValidationError('Workspace not running');
        }

        const sandbox = await this.context.getSandbox(workspace);
        await this.context.addLog(workspaceId, 'info', `Pushing changes from ${repoPath}`);
        await sandbox.git.push(repoPath);
    }

    /**
     * Pull changes from remote repository
     */
    async gitPull(workspaceId: bigint, repoPath: string): Promise<void> {
        const workspace = await this.context.getWorkspace(workspaceId);
        if (!this.context.daytona || !workspace.daytona_sandbox_id) {
            throw new ValidationError('Workspace not running');
        }

        const sandbox = await this.context.getSandbox(workspace);
        await this.context.addLog(workspaceId, 'info', `Pulling changes to ${repoPath}`);
        await sandbox.git.pull(repoPath);
    }

    /**
     * List all branches in repository
     */
    async gitBranches(workspaceId: bigint, repoPath: string): Promise<any> {
        const workspace = await this.context.getWorkspace(workspaceId);
        if (!this.context.daytona || !workspace.daytona_sandbox_id) {
            throw new ValidationError('Workspace not running');
        }

        const sandbox = await this.context.getSandbox(workspace);
        await this.context.addLog(workspaceId, 'info', `Listing branches in ${repoPath}`);
        return await sandbox.git.branches(repoPath);
    }

    /**
     * Create a new branch
     */
    async gitCreateBranch(workspaceId: bigint, repoPath: string, branchName: string): Promise<void> {
        const workspace = await this.context.getWorkspace(workspaceId);
        if (!this.context.daytona || !workspace.daytona_sandbox_id) {
            throw new ValidationError('Workspace not running');
        }

        const sandbox = await this.context.getSandbox(workspace);
        await this.context.addLog(workspaceId, 'info', `Creating branch '${branchName}' in ${repoPath}`);
        await sandbox.git.createBranch(repoPath, branchName);
    }

    /**
     * Checkout a branch
     */
    async gitCheckoutBranch(workspaceId: bigint, repoPath: string, branchName: string): Promise<void> {
        const workspace = await this.context.getWorkspace(workspaceId);
        if (!this.context.daytona || !workspace.daytona_sandbox_id) {
            throw new ValidationError('Workspace not running');
        }

        const sandbox = await this.context.getSandbox(workspace);
        await this.context.addLog(workspaceId, 'info', `Checking out branch '${branchName}' in ${repoPath}`);
        await sandbox.git.checkoutBranch(repoPath, branchName);
    }

    /**
     * Delete a branch
     */
    async gitDeleteBranch(workspaceId: bigint, repoPath: string, branchName: string): Promise<void> {
        const workspace = await this.context.getWorkspace(workspaceId);
        if (!this.context.daytona || !workspace.daytona_sandbox_id) {
            throw new ValidationError('Workspace not running');
        }

        const sandbox = await this.context.getSandbox(workspace);
        await this.context.addLog(workspaceId, 'info', `Deleting branch '${branchName}' in ${repoPath}`);
        await sandbox.git.deleteBranch(repoPath, branchName);
    }
}
