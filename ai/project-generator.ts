/**
 * Project Generation Orchestration
 * Manages the end-to-end project generation workflow
 */

import Anthropic from '@anthropic-ai/sdk';
import { secret } from 'encore.dev/config';
import { daytonaManager } from '../workspace/daytona-manager.js';
import { db } from '../projects/db.js';
import { buildProjectGenerationPrompt, type WizardData } from './prompt-templates.js';
import { executeAgentTool, estimateProgress } from './tool-handlers.js';

// Define Anthropic API key secret
const anthropicAPIKey = secret("AnthropicAPIKey");

interface GenerationJob {
  id: bigint;
  project_id: bigint;
  workspace_id: bigint | null;
  status: string;
  progress: number;
  current_step: string | null;
  wizard_data: WizardData;
  error_message: string | null;
  started_at: Date;
  completed_at: Date | null;
  created_at: Date;
}

/**
 * Start project generation workflow
 */
export async function startProjectGeneration(
  projectId: bigint,
  wizardData: WizardData,
  userId: string
): Promise<{ jobId: bigint }> {
  console.log(`[Generator] Starting project generation for project ${projectId} by user ${userId}`);

  // Check for existing running job to prevent concurrent generation
  const existingJob = await db.queryRow<GenerationJob>`
    SELECT * FROM generation_jobs
    WHERE project_id = ${projectId}
      AND status IN ('initializing', 'creating_workspace', 'generating')
    ORDER BY created_at DESC
    LIMIT 1
  `;

  if (existingJob) {
    console.log(`[Generator] Found existing running job ${existingJob.id} for project ${projectId}`);
    return { jobId: existingJob.id };
  }

  // Create generation job
  const job = await db.queryRow<GenerationJob>`
    INSERT INTO generation_jobs (
      project_id,
      status,
      progress,
      current_step,
      wizard_data
    ) VALUES (
      ${projectId},
      'initializing',
      0,
      'Creating workspace',
      ${JSON.stringify(wizardData)}
    )
    RETURNING *
  `;

  if (!job) {
    throw new Error('Failed to create generation job');
  }

  // Run generation asynchronously (don't await)
  runGeneration(job.id, projectId, wizardData, userId).catch(error => {
    console.error(`[Generator] Fatal error in generation:`, error);
    markJobFailed(job.id, error.message);
  });

  return { jobId: job.id };
}

/**
 * Main generation workflow
 */
async function runGeneration(
  jobId: bigint,
  projectId: bigint,
  wizardData: WizardData,
  userId: string
): Promise<void> {
  let workspaceCreated = false;
  let workspaceId: bigint | null = null;

  try {
    // Phase 1: Check for existing workspace or create new one
    let workspace = await daytonaManager.getProjectWorkspace(projectId);

    if (!workspace) {
      console.log(`[Generator] Creating new Daytona workspace for project ${projectId}`);
      await updateJobStatus(jobId, 'creating_workspace', 5, 'Creating development workspace');

      workspace = await daytonaManager.createWorkspace(
        projectId,
        `workspace-${projectId}`,
        {
          language: 'typescript',
          image: 'node:20-alpine',
          ephemeral: false,
          autoStopInterval: 3600, // 1 hour
        }
      );

      workspaceCreated = true;
      workspaceId = workspace.id;

      // Update job with workspace ID
      await db.exec`
        UPDATE generation_jobs
        SET workspace_id = ${workspace.id}
        WHERE id = ${jobId}
      `;

      // Update project with workspace ID (sandbox ID will be set later when workspace starts)
      // The workspace record stores the daytona_sandbox_id which gets populated asynchronously
      console.log(`[Generator] Workspace record created, sandbox ID will be populated when workspace starts`);

      console.log(`[Generator] ✓ Workspace ${workspace.id} created successfully`);
    } else {
      console.log(`[Generator] Using existing workspace ${workspace.id} for project ${projectId}`);
      await updateJobStatus(jobId, 'generating', 10, 'Using existing workspace');
      workspaceId = workspace.id;

      // Update job with existing workspace ID
      await db.exec`
        UPDATE generation_jobs
        SET workspace_id = ${workspace.id}
        WHERE id = ${jobId}
      `;
    }

    // ✅ Phase 1.5: Ensure workspace is fully running before AI generation starts
    console.log(`[Generator] Ensuring workspace is ready for code generation...`);
    await updateJobStatus(jobId, 'preparing_workspace', 8, 'Waiting for workspace to be ready');

    const MAX_WAIT_SECONDS = 60;
    const POLL_INTERVAL_MS = 2000; // Poll every 2 seconds
    const maxAttempts = Math.floor((MAX_WAIT_SECONDS * 1000) / POLL_INTERVAL_MS);
    let attempts = 0;
    let workspaceReady = false;

    while (attempts < maxAttempts && !workspaceReady) {
      const currentWorkspace = await daytonaManager.getWorkspace(workspace.id);

      if (currentWorkspace.status === 'running') {
        console.log(`[Generator] ✓ Workspace is running and ready`);
        workspaceReady = true;
        break;
      }

      if (currentWorkspace.status === 'error' || currentWorkspace.status === 'deleted') {
        throw new Error(`Workspace failed to start: ${currentWorkspace.error_message || 'Unknown error'}`);
      }

      attempts++;
      console.log(`[Generator] Workspace status: ${currentWorkspace.status}, waiting... (${attempts}/${maxAttempts})`);
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    if (!workspaceReady) {
      throw new Error(`Workspace did not reach 'running' status after ${MAX_WAIT_SECONDS} seconds`);
    }

    // Phase 2: Generate project with AI
    console.log(`[Generator] Starting AI-powered code generation (workspace ready)`);
    await updateJobStatus(jobId, 'generating', 10, 'Generating project code');

    await generateWithAI(jobId, projectId, workspace.id, wizardData, userId);

    console.log(`[Generator] Project generation completed successfully`);
  } catch (error) {
    console.error(`[Generator] Generation failed:`, error);
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';

    // Rollback: Delete workspace if it was created
    if (workspaceCreated && workspaceId) {
      console.log(`[Generator] Rolling back workspace ${workspaceId} due to generation failure`);
      try {
        await daytonaManager.deleteWorkspace(workspaceId);
        console.log(`[Generator] ✓ Workspace ${workspaceId} cleaned up successfully`);

        // Clear workspace references from database
        await db.exec`
          UPDATE generation_jobs
          SET workspace_id = NULL
          WHERE id = ${jobId}
        `;

        await db.exec`
          UPDATE projects
          SET daytona_workspace_id = NULL
          WHERE id = ${projectId}
        `;
      } catch (deleteError) {
        console.error(`[Generator] ✗ Failed to cleanup workspace ${workspaceId}:`, deleteError);
        // Log cleanup failure but don't throw - we still want to mark job as failed
        await db.exec`
          INSERT INTO generation_logs (job_id, level, message, tool_name)
          VALUES (
            ${jobId},
            'error',
            ${`Failed to cleanup workspace: ${deleteError instanceof Error ? deleteError.message : 'Unknown error'}`},
            'system'
          )
        `;
      }
    }

    await markJobFailed(jobId, errorMsg);
    throw error;
  }
}

/**
 * Generate project using AI agent with agentic loop
 */
async function generateWithAI(
  jobId: bigint,
  projectId: bigint,
  workspaceId: bigint,
  wizardData: WizardData,
  userId: string
): Promise<void> {
  // Get user's API key from user_secrets (encrypted)
  const { getUserAnthropicKey } = await import('../users/secrets.js');
  let apiKey = await getUserAnthropicKey(userId);

  // Fall back to system Encore secret if user hasn't set their own key
  if (!apiKey) {
    apiKey = anthropicAPIKey();
  }

  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured. Please add your API key in Settings > AI or configure the system secret.');
  }

  const anthropic = new Anthropic({ apiKey });

  // Build generation prompt
  const generationPrompt = buildProjectGenerationPrompt(wizardData);

  console.log(`[Generator] Built generation prompt (${generationPrompt.length} chars)`);

  // System prompt for the agent
  const systemPrompt = `You are an expert full-stack developer assistant. You have been given a detailed specification for a project to build. Follow the instructions carefully and use the provided tools to create all necessary files and set up the project.

Work methodically through each phase of the project setup. Always use write_to_file with complete file contents. Use execute_command to run setup commands. When you have completed all phases and verified the project works, use attempt_completion.`;

  // Initialize conversation
  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content: generationPrompt,
    },
  ];

  // Agent loop - allow up to 100 iterations
  const MAX_ITERATIONS = 100;
  let iteration = 0;
  let continueGeneration = true;

  while (continueGeneration && iteration < MAX_ITERATIONS) {
    iteration++;
    console.log(`[Generator] Agent iteration ${iteration}/${MAX_ITERATIONS}`);

    // Call Claude API
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 8192,
      system: systemPrompt,
      messages,
      tools: [
        {
          name: 'write_to_file',
          description: 'Create or overwrite a file with content',
          input_schema: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'File path' },
              content: { type: 'string', description: 'Complete file content' },
              line_count: { type: 'number', description: 'Number of lines' },
            },
            required: ['path', 'content'],
          },
        },
        {
          name: 'read_file',
          description: 'Read a file from the workspace',
          input_schema: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'File path' },
            },
            required: ['path'],
          },
        },
        {
          name: 'execute_command',
          description: 'Execute a shell command',
          input_schema: {
            type: 'object',
            properties: {
              command: { type: 'string', description: 'Shell command to execute' },
            },
            required: ['command'],
          },
        },
        {
          name: 'list_files',
          description: 'List files in a directory',
          input_schema: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Directory path' },
              recursive: { type: 'boolean', description: 'Recursive listing' },
            },
          },
        },
        {
          name: 'attempt_completion',
          description: 'Signal that the project generation is complete',
          input_schema: {
            type: 'object',
            properties: {
              result: { type: 'string', description: 'Summary of what was built' },
              command: { type: 'string', description: 'Command to run the project' },
            },
            required: ['result'],
          },
        },
      ],
    });

    // Add assistant response to conversation
    messages.push({
      role: 'assistant',
      content: response.content,
    });

    // Handle tool uses
    const toolUses = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
    );

    if (toolUses.length === 0) {
      // No tool uses, check stop reason
      if (response.stop_reason === 'end_turn') {
        console.log(`[Generator] Agent finished without completion signal`);
        break;
      }
      continue;
    }

    // Execute all tool uses and collect results
    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const toolUse of toolUses) {
      console.log(`[Generator] Executing tool: ${toolUse.name}`);

      // Check for completion
      if (toolUse.name === 'attempt_completion') {
        console.log(`[Generator] Agent signaled completion`);
        continueGeneration = false;

        const result = await executeAgentTool(toolUse, {
          workspaceId,
          projectId,
          jobId,
        });

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: JSON.stringify(result.result),
        });

        break;
      }

      // Execute tool
      const result = await executeAgentTool(toolUse, {
        workspaceId,
        projectId,
        jobId,
      });

      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: result.success ? JSON.stringify(result.result) : `Error: ${result.error}`,
        is_error: !result.success,
      });

      // Update progress based on tool executions
      const logs = await db.query<any>`
        SELECT tool_name FROM generation_logs WHERE job_id = ${jobId}
      `;
      const logArray = [];
      for await (const log of logs) {
        logArray.push(log);
      }
      const progress = estimateProgress(logArray);

      await updateJobStatus(
        jobId,
        'generating',
        progress,
        `Executing: ${toolUse.name}`
      );
    }

    // Add tool results to conversation
    if (toolResults.length > 0) {
      messages.push({
        role: 'user',
        content: toolResults,
      });
    }
  }

  if (iteration >= MAX_ITERATIONS) {
    throw new Error('Generation exceeded maximum iterations');
  }

  console.log(`[Generator] AI generation completed in ${iteration} iterations`);
}

/**
 * Update job status and progress
 */
async function updateJobStatus(
  jobId: bigint,
  status: string,
  progress: number,
  currentStep: string
): Promise<void> {
  await db.exec`
    UPDATE generation_jobs
    SET
      status = ${status},
      progress = ${progress},
      current_step = ${currentStep}
    WHERE id = ${jobId}
  `;
}

/**
 * Mark job as failed
 */
async function markJobFailed(jobId: bigint, errorMessage: string): Promise<void> {
  await db.exec`
    UPDATE generation_jobs
    SET
      status = 'failed',
      error_message = ${errorMessage},
      completed_at = NOW()
    WHERE id = ${jobId}
  `;

  // Also log the error
  await db.exec`
    INSERT INTO generation_logs (job_id, level, message, tool_name)
    VALUES (${jobId}, 'error', ${errorMessage}, 'system')
  `;
}

/**
 * Get generation job by ID
 */
export async function getGenerationJob(jobId: bigint): Promise<GenerationJob | null> {
  const job = await db.queryRow<GenerationJob>`
    SELECT * FROM generation_jobs WHERE id = ${jobId}
  `;
  return job || null;
}

/**
 * Get generation logs for a job
 */
export async function getGenerationLogs(
  jobId: bigint,
  limit: number = 100
): Promise<any[]> {
  const logs = [];
  for await (const log of db.query<any>`
    SELECT * FROM generation_logs
    WHERE job_id = ${jobId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `) {
    logs.push(log);
  }
  return logs;
}
