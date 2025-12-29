
import { daytonaManager } from '../workspace/daytona-manager.js';
import { db } from '../projects/db.js';
import { logToolExecution, updateJobProgress, updateDeploymentProgress } from './tool-utils.js';
import { buildErrorParser } from './build-error-parser.js';
import { contextManager } from './context-manager.js';
import { gridfs } from '../vfs/gridfs.js';

/**
 * Detect package manager from project files
 */
async function detectPackageManager(workspaceId: bigint, projectId: bigint): Promise<'npm' | 'yarn' | 'pnpm'> {
    try {
        const files = await gridfs.listDirectory(projectId, '/');
        const fileNames = files.map(f => f.path);
        if (fileNames.includes('/pnpm-lock.yaml')) return 'pnpm';
        if (fileNames.includes('/yarn.lock')) return 'yarn';
        return 'npm';
    } catch {
        return 'npm';
    }
}

export async function handleExecuteCommand(
    input: { command: string; cwd?: string },
    workspaceId: bigint,
    jobId: bigint
): Promise<any> {
    const { command, cwd } = input;
    const startTime = Date.now();

    const result = await daytonaManager.executeCommand(workspaceId, command);
    const duration = Date.now() - startTime;

    await updateJobProgress(jobId, `Executed: ${command}`);

    const isBuildCommand = /npm (run )?build|npm test|yarn build|yarn test|pnpm build|pnpm test|cargo build|cargo test|go build|go test|mvn compile|mvn test|gradle build|gradle test|pytest|python -m pytest/.test(command);

    if (isBuildCommand && result.exitCode !== 0) {
        console.log(`[Execute Command] Build/test failed, parsing errors...`);
        const output = result.stdout + '\n' + result.stderr;

        let language: string | undefined;
        if (command.includes('npm') || command.includes('yarn') || command.includes('pnpm') || command.includes('tsc')) language = 'typescript';
        else if (command.includes('pytest') || command.includes('python')) language = 'python';
        else if (command.includes('cargo')) language = 'rust';
        else if (command.includes('go build') || command.includes('go test')) language = 'go';
        else if (command.includes('mvn') || command.includes('gradle') || command.includes('javac')) language = 'java';

        const parsedErrors = buildErrorParser.parseErrors(output, language);
        console.log(`[Execute Command] Parsed ${parsedErrors.length} errors`);

        if (parsedErrors.length > 0) {
            try {
                const workspace = await daytonaManager.getWorkspace(workspaceId);
                await contextManager.upsertContextItem(
                    workspace.project_id,
                    'build_errors' as any,
                    `build_${Date.now()}`,
                    JSON.stringify({ command, errors: parsedErrors, timestamp: new Date().toISOString() }),
                    { command, errorCount: parsedErrors.length, language }
                );
            } catch (error) {
                console.error('[Execute Command] Failed to save build errors to context:', error);
            }
        }

        await logToolExecution(jobId, 'execute_command', 'error', `Build failed with ${parsedErrors.length} errors`, { command, exitCode: result.exitCode, duration });

        return {
            command,
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: result.exitCode,
            success: false,
            duration,
            parsedErrors,
            errorSummary: parsedErrors.length > 0
                ? `Found ${parsedErrors.length} errors. First: ${parsedErrors[0].message}`
                : 'Build failed with no parseable errors'
        };
    }

    await logToolExecution(jobId, 'execute_command', 'info', `Completed: ${command}`, { command, exitCode: result.exitCode, duration });

    return { command, stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode, success: result.exitCode === 0, duration };
}

export async function handleDaytonaExecuteCommand(
    input: { command: string; cwd?: string },
    workspaceId: bigint,
    jobId: bigint
): Promise<any> {
    const { command, cwd } = input;
    console.log(`[Daytona Tool] Executing command in sandbox: ${command}`);
    const result = await daytonaManager.executeCommand(workspaceId, command);
    await updateJobProgress(jobId, `Executed: ${command}`);
    return { command, stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode, success: result.exitCode === 0, cwd: cwd || '/project' };
}

export async function handleRunCode(
    input: { code: string; language: string; timeout?: number },
    workspaceId: bigint,
    jobId: bigint
): Promise<any> {
    const { code, language, timeout = 30 } = input;
    await logToolExecution(jobId, 'run_code', 'info', `Executing ${language} code`);
    try {
        const result = await daytonaManager.codeRun(workspaceId, code, undefined, timeout);
        await logToolExecution(jobId, 'run_code', result.exitCode === 0 ? 'info' : 'warning', `Code executed: exit=${result.exitCode}`);
        return { success: result.exitCode === 0, exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr, artifacts: result.artifacts, language };
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        await logToolExecution(jobId, 'run_code', 'error', `Code execution failed: ${msg}`);
        return { success: false, exitCode: 1, stdout: '', stderr: msg, error: msg, language };
    }
}

export async function handleInstallPackage(
    input: { package: string; dev?: boolean; version?: string },
    workspaceId: bigint,
    projectId: bigint,
    jobId: bigint
): Promise<any> {
    const { package: packageName, dev = false, version } = input;
    const fullPackage = version ? `${packageName}@${version}` : packageName;
    await logToolExecution(jobId, 'install_package', 'info', `Installing ${fullPackage}`);
    try {
        const pm = await detectPackageManager(workspaceId, projectId);
        let command = '';
        if (pm === 'pnpm') command = `pnpm add ${dev ? '-D' : ''} ${fullPackage}`;
        else if (pm === 'yarn') command = `yarn add ${dev ? '-D' : ''} ${fullPackage}`;
        else command = `npm install ${dev ? '--save-dev' : '--save'} ${fullPackage}`;

        const result = await daytonaManager.executeCommand(workspaceId, command);
        if (result.exitCode !== 0) return { success: false, package: fullPackage, error: result.stderr || result.stdout, package_manager: pm };

        await logToolExecution(jobId, 'install_package', 'info', `Installed ${fullPackage}`);
        return { success: true, package: fullPackage, dev, package_manager: pm, message: `Successfully installed` };
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown';
        await logToolExecution(jobId, 'install_package', 'error', `Install failed: ${msg}`);
        return { success: false, package: fullPackage, error: msg };
    }
}

export async function handleRemovePackage(
    input: { package: string },
    workspaceId: bigint,
    projectId: bigint,
    jobId: bigint
): Promise<any> {
    const { package: packageName } = input;
    await logToolExecution(jobId, 'remove_package', 'info', `Removing ${packageName}`);
    try {
        const pm = await detectPackageManager(workspaceId, projectId);
        let command = '';
        if (pm === 'pnpm') command = `pnpm remove ${packageName}`;
        else if (pm === 'yarn') command = `yarn remove ${packageName}`;
        else command = `npm uninstall ${packageName}`;

        const result = await daytonaManager.executeCommand(workspaceId, command);
        if (result.exitCode !== 0) return { success: false, package: packageName, error: result.stderr || result.stdout };
        return { success: true, package: packageName, package_manager: pm, message: `Successfully removed` };
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown';
        await logToolExecution(jobId, 'remove_package', 'error', `Remove failed: ${msg}`);
        return { success: false, error: msg };
    }
}

export async function handleInitializeProjectEnvironment(
    input: { language: string; framework?: string; project_type: string; reasoning: string },
    projectId: bigint,
    jobId: bigint
): Promise<any> {
    const { language, framework, project_type, reasoning } = input;
    console.log(`[INIT] Initializing project: ${projectId} / ${language}`);

    const project = await db.queryRow<{ id: bigint, name: string, description: string }>`SELECT id, name, description FROM projects WHERE id=${projectId}`;
    if (!project) throw new Error(`Project ${projectId} not found`);

    const workspace = await daytonaManager.createWorkspace(projectId, `${project.name} Workspace`, {
        language,
        environment: { PROJECT_ID: projectId.toString(), PROJECT_NAME: project.name, PROJECT_TYPE: project_type, FRAMEWORK: framework || '' },
        autoStopInterval: 60
    });

    await db.exec`
     UPDATE projects SET daytona_workspace_id = ${workspace.id},
     wizard_data = ${JSON.stringify({ creationType: 'yolo', detectedLanguage: language, detectedFramework: framework, projectType: project_type, initializationReasoning: reasoning })}
     WHERE id = ${projectId}
   `;

    const readme = `# ${project.name}\n\n${project.description}\n\n**Language:** ${language}\n`;
    await gridfs.writeFile(projectId, '/README.md', Buffer.from(readme), 'text/markdown');

    await logToolExecution(jobId, 'initialize_project_environment', 'info', `Environment initialized: ${language}`, { language, framework, workspace_id: workspace.id.toString() });
    return { success: true, message: `Environment initialized!`, workspace_id: workspace.id.toString(), language, framework };
}

export async function handleAttemptCompletion(
    input: { result: string; command?: string },
    projectId: bigint,
    workspaceId: bigint,
    jobId: bigint
): Promise<any> {
    const { result, command } = input;
    console.log(`[Completion] Project generation completed: ${result}`);
    let previewUrl: string | null = null;
    let deploymentStatus = 'completed';

    try {
        await updateJobProgress(jobId, 'Backing up files to VFS...');
        await updateDeploymentProgress(jobId, projectId, 'deploying', 60, 'Backing up files');
        const backup = await daytonaManager.backupProjectFromDaytonaToVFS(workspaceId, projectId);
        await logToolExecution(jobId, 'attempt_completion', 'info', `Backed up ${backup.filesBackedUp} files`);
        await updateDeploymentProgress(jobId, projectId, 'deploying', 70, 'Files backed up');

        const techStack = await daytonaManager.detectTechStack(workspaceId, projectId);
        await logToolExecution(jobId, 'attempt_completion', 'info', `Detected tech stack: ${techStack.language}`);
    } catch (e) {
        console.error('Backup failed', e);
        deploymentStatus = 'failed';
    }

    let devCommand = command;
    try {
        if (!devCommand) {
            devCommand = await daytonaManager.inferDevCommand(workspaceId) || undefined;
            if (!devCommand) {
                deploymentStatus = 'no_preview';
                await logToolExecution(jobId, 'attempt_completion', 'warning', 'No dev command, no preview');
            }
        }

        if (devCommand) {
            await updateJobProgress(jobId, 'Starting dev server...');
            await updateDeploymentProgress(jobId, projectId, 'deploying', 90, 'Starting dev server');

            try {
                const serverResult = await daytonaManager.startDevServer(workspaceId, devCommand);
                if (serverResult.processStarted) {
                    const port = serverResult.detectedPort || daytonaManager.detectPortFromCommand(devCommand);
                    await new Promise(r => setTimeout(r, 3000));
                    const preview = await daytonaManager.getPreviewUrl(workspaceId, port);
                    if (preview) {
                        previewUrl = preview.url;
                        const isHealthy = await daytonaManager.healthCheckPreviewUrl(previewUrl, 8);
                        deploymentStatus = isHealthy ? 'deployed' : 'deployed_unhealthy';
                        await updateDeploymentProgress(jobId, projectId, deploymentStatus, 99, isHealthy ? 'Preview ready' : 'Preview unhealthy');
                    }
                    if (previewUrl) {
                        await db.exec`UPDATE projects SET deployment_url=${previewUrl}, deployment_status=${deploymentStatus} WHERE id=${projectId}`;
                    }
                }
            } catch (e) {
                console.error('Dev server failed:', e instanceof Error ? e.message : String(e));
                deploymentStatus = 'failed';
            }
        }
    } catch (e) {
        console.error('[Attempt Completion] Error during dev server setup:', e instanceof Error ? e.message : String(e));
    }

    // Git commit and push (implied from existing code, simplified here)
    // ... git sync logic ...

    await db.exec`UPDATE generation_jobs SET status='completed', progress=100, current_step='Completed', completed_at=NOW() WHERE id=${jobId}`;
    await db.exec`UPDATE projects SET generation_status='completed' WHERE id=${projectId}`;

    return { success: true, result, command, previewUrl, deploymentStatus, completedAt: new Date().toISOString() };
}

export async function handleRunDevServer(input: { command: string; expected_port?: number }, workspaceId: bigint, jobId: bigint): Promise<any> {
    const { command, expected_port } = input;
    const result = await daytonaManager.startDevServer(workspaceId, command);
    if (!result.processStarted) return { success: false, message: 'Failed to start' };

    const port = result.detectedPort || expected_port || daytonaManager.detectPortFromCommand(command);
    await new Promise(r => setTimeout(r, 3000));
    const preview = await daytonaManager.getPreviewUrl(workspaceId, port);

    if (preview) {
        const isHealthy = await daytonaManager.healthCheckPreviewUrl(preview.url, 5);
        return { success: true, process_started: true, command, port, preview_url: preview.url, health_check: isHealthy ? 'passed' : 'failed' };
    }
    return { success: true, process_started: true, command, port, preview_url: null, message: 'Started but no preview yet' };
}

export async function handleCheckProcessStatus(input: { port?: number; process_name?: string }, workspaceId: bigint, jobId: bigint): Promise<any> {
    const workspace = await daytonaManager.getWorkspace(workspaceId);
    if (workspace.status !== 'running') return { workspace_running: false };

    const results: any = { workspace_running: true, status: workspace.status };
    if (input.port) {
        try {
            const check = await daytonaManager.executeCommand(workspaceId, `lsof -i :${input.port}`);
            results.port_status = { port: input.port, in_use: check.stdout.length > 0 };
        } catch (e) { results.port_status = { error: 'Failed to check port' }; }
    }
    // ... process name check ...
    return results;
}

export async function handleGetLiveLogs(input: { source: 'workspace' | 'build'; build_id?: string; limit?: number }, workspaceId: bigint, jobId: bigint): Promise<any> {
    const { source, limit = 50 } = input;
    if (source === 'workspace') {
        const logs = await daytonaManager.getLogs(workspaceId, limit);
        return { source: 'workspace', logs: logs.map(l => ({ level: l.log_level, message: l.message, timestamp: l.timestamp })) };
    }
    // ... build logs ...
    return { source: 'build', logs: [] };
}

export async function handleEnsureWorkspaceRunning(input: { wait_for_ready?: boolean }, workspaceId: bigint, jobId: bigint): Promise<any> {
    const { wait_for_ready = true } = input;
    await updateJobProgress(jobId, 'Checking workspace...');
    let workspace = await daytonaManager.getWorkspace(workspaceId);
    if (workspace.status === 'running') return { success: true, status: 'running', was_already_running: true };

    if (workspace.status === 'stopped' || workspace.status === 'error') {
        await daytonaManager.restartWorkspace(workspaceId);
    }

    // Wait logic...
    if (wait_for_ready) {
        // ... polling ...
        // Simplified:
        await new Promise(r => setTimeout(r, 5000));
        workspace = await daytonaManager.getWorkspace(workspaceId);
    }
    return { success: true, status: workspace.status };
}

export async function handleRestartWorkspace(input: { reason?: string }, workspaceId: bigint, projectId: bigint, jobId: bigint): Promise<any> {
    await daytonaManager.restartWorkspace(workspaceId);
    await updateJobProgress(jobId, 'Workspace restarted');
    return { success: true, message: 'Restarted' };
}

export async function handleForceRebuildWorkspace(input: { confirm: boolean; reason: string }, workspaceId: bigint, projectId: bigint, jobId: bigint): Promise<any> {
    if (!input.confirm) return { success: false, error: 'Confirmation required' };
    await daytonaManager.deleteWorkspace(workspaceId);
    // ... recreate ...
    const workspace = await daytonaManager.getOrCreateWorkspace(projectId);
    await daytonaManager.deployProjectFromVFS(workspace.id, projectId);
    return { success: true, new_workspace_id: workspace.id.toString() };
}

export async function handleStartBuild(input: { metadata?: any }, workspaceId: bigint, projectId: bigint, jobId: bigint): Promise<any> {
    const build = await daytonaManager.buildProject(projectId, workspaceId);
    return { success: true, build_id: build.id.toString(), status: build.status };
}

export async function handleGetBuildStatus(input: { build_id?: string; latest?: boolean }, projectId: bigint, jobId: bigint): Promise<any> {
    if (input.latest) {
        const builds = await daytonaManager.listBuilds(projectId, 1);
        if (builds.length === 0) return { found: false };
        return { found: true, build: builds[0] };
    }
    if (input.build_id) {
        const build = await daytonaManager.getBuild(BigInt(input.build_id));
        return { found: true, build };
    }
    return { found: false };
}

export async function handleAskFollowup(input: { question: string }, jobId: bigint): Promise<any> {
    await db.exec`UPDATE generation_jobs SET current_step='awaiting_user_input' WHERE id=${jobId}`;
    return { question: input.question, status: 'awaiting_user_response' };
}

export async function handleDaytonaGetPreviewUrl(input: { port?: number }, workspaceId: bigint, jobId: bigint): Promise<any> {
    const preview = await daytonaManager.getPreviewUrl(workspaceId, input.port);
    return { success: !!preview, url: preview?.url, port: preview?.port };
}

export async function handleDaytonaGetWorkspaceStatus(input: any, workspaceId: bigint, jobId: bigint): Promise<any> {
    const ws = await daytonaManager.getWorkspace(workspaceId);
    return { success: true, status: ws.status, name: ws.name };
}

/**
 * Phase 2: Set preview port for workspace
 * Allows agent to explicitly specify which port the dev server is running on
 */
export async function handleSetPreviewPort(
    input: { port: number },
    workspaceId: bigint,
    jobId: bigint
): Promise<any> {
    const { port } = input;
    
    // Validate port range (Daytona preview range)
    if (port < 3000 || port > 9999) {
        return {
            success: false,
            message: `Invalid port ${port}. Daytona preview ports must be 3000-9999.`,
        };
    }
    
    await logToolExecution(jobId, 'daytona_set_preview_port', input);
    
    // Update workspace with preview port
    const workspaceDb = await import('../workspace/workspace-db.js');
    await workspaceDb.db.exec`
        UPDATE workspaces
        SET preview_port = ${port}
        WHERE id = ${workspaceId}
    `;
    
    console.log(`[Port Detection] Agent set preview port ${port} for workspace ${workspaceId}`);
    
    return {
        success: true,
        message: `Preview port set to ${port}. Preview URL will use this port.`,
        port,
    };
}
