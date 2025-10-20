'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/nextjs';
import { api } from '@/lib/api';
import { ProjectVisionStep } from './steps/ProjectVisionStep';
import { TechStackStep } from './steps/TechStackStep';
import { IntegrationsStep } from './steps/IntegrationsStep';
import { ReviewStep } from './steps/ReviewStep';
import { renderGitHubPATStep, renderRepositorySelectionStep, renderBranchSelectionStep } from './github-import-steps';
import './ProjectCreationModal.css';

interface ProjectCreationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete?: (projectId: string) => void;
}

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  private: boolean;
  default_branch: string;
}

interface GitHubBranch {
  name: string;
}

interface ProjectWizardData {
  creationType?: 'new' | 'github-import'; // New field for creation type
  githubImport?: {
    pat?: string;
    selectedRepo?: GitHubRepo;
    repoFullName?: string;
    branch?: string;
  };
  vision: {
    name: string;
    description: string;
    coreFeatures: string;
    targetAudience: string;
    projectGoals: string[];
    inspirationApps: string[];
  };
  techStack: {
    selectedTemplate: string;
    backend?: string;
    frontend?: string;
    database?: string;
  };
  integrations: Record<string, any>;
}

const STEPS = [
  {
    id: 'creation-type',
    title: 'Creation Type',
    description: 'Choose how to create your project'
  },
  {
    id: 'vision',
    title: 'Project Vision',
    description: 'Define your project goals and requirements'
  },
  {
    id: 'tech-stack',
    title: 'Tech Stack',
    description: 'Choose your technology foundation'
  },
  {
    id: 'integrations',
    title: 'Integrations',
    description: 'Add third-party services'
  },
  {
    id: 'review',
    title: 'Review & Generate',
    description: 'Review and create your project'
  }
];

export const ProjectCreationModal: React.FC<ProjectCreationModalProps> = ({
  isOpen,
  onClose,
  onComplete
}) => {
  const { getToken } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);
  const [isClosing, setIsClosing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState({
    status: 'not_started',
    progress: 0,
    currentStep: null as string | null,
    tasks: [] as Array<{ name: string; status: 'pending' | 'in_progress' | 'completed' | 'failed'; progress?: number }>,
    previewUrl: null as string | null
  });
  const [projectData, setProjectData] = useState<ProjectWizardData>({
    creationType: undefined,
    githubImport: {
      pat: '',
      selectedRepo: undefined,
      repoFullName: '',
      branch: ''
    },
    vision: {
      name: '',
      description: '',
      coreFeatures: '',
      targetAudience: '',
      projectGoals: [],
      inspirationApps: []
    },
    techStack: {
      selectedTemplate: 'encore-react'
    },
    integrations: {}
  });

  // GitHub-specific state
  const [githubRepos, setGithubRepos] = useState<GitHubRepo[]>([]);
  const [githubBranches, setGithubBranches] = useState<GitHubBranch[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [githubError, setGithubError] = useState<string | null>(null);

  const [validation, setValidation] = useState({
    isValid: false,
    errors: [] as string[],
    warnings: [] as string[]
  });
  const [showValidation, setShowValidation] = useState(false);

  // Validate current step
  useEffect(() => {
    validateCurrentStep();
  }, [currentStep, projectData]);

  const validateCurrentStep = () => {
    const errors: string[] = [];
    const warnings: string[] = [];

    switch (currentStep) {
      case 0: // Creation Type
        if (!projectData.creationType) {
          errors.push('Please select how you want to create your project');
        }
        break;

      case 1: // Vision (or GitHub PAT if importing)
        if (projectData.creationType === 'github-import') {
          if (!projectData.githubImport?.pat?.trim()) {
            errors.push('GitHub Personal Access Token is required');
          }
        } else {
          if (!projectData.vision.name?.trim()) {
            errors.push('Project name is required');
          }
          if (!projectData.vision.description?.trim()) {
            errors.push('Project description is required');
          }
          if (!projectData.vision.coreFeatures?.trim()) {
            errors.push('Core features description is required');
          }
          if (!projectData.vision.targetAudience?.trim()) {
            warnings.push('Consider specifying your target audience');
          }
        }
        break;

      case 2: // Repository selection or Tech Stack
        if (projectData.creationType === 'github-import') {
          if (!projectData.githubImport?.selectedRepo) {
            errors.push('Please select a repository');
          }
        } else if (projectData.creationType === 'new') {
          if (!projectData.techStack.selectedTemplate) {
            errors.push('Please select a tech stack template');
          }
        }
        break;

      case 3: // Branch selection or Integrations
        if (projectData.creationType === 'github-import') {
          if (!projectData.githubImport?.branch) {
            errors.push('Please select a branch');
          }
        }
        // Integrations are optional for new projects
        break;

      case 4: // Review
        // Final validation
        if (projectData.creationType === 'github-import') {
          if (!projectData.githubImport?.pat || !projectData.githubImport?.selectedRepo || !projectData.githubImport?.branch) {
            errors.push('Please complete all GitHub import fields');
          }
        } else {
          if (!projectData.vision.name || !projectData.vision.description) {
            errors.push('Please complete all required fields');
          }
        }
        break;
    }

    setValidation({
      isValid: errors.length === 0,
      errors,
      warnings
    });
  };

  const handleClose = useCallback(() => {
    if (isGenerating) return;

    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      setCurrentStep(0);
      setShowValidation(false);
      setProjectData({
        creationType: undefined,
        githubImport: {
          pat: '',
          repoFullName: '',
          branch: ''
        },
        vision: {
          name: '',
          description: '',
          coreFeatures: '',
          targetAudience: '',
          projectGoals: [],
          inspirationApps: []
        },
        techStack: {
          selectedTemplate: 'encore-react'
        },
        integrations: {}
      });
      onClose();
    }, 300);
  }, [isGenerating, onClose]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !isGenerating) {
      handleClose();
    }
  };

  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape' && !isGenerating) {
        handleClose();
      }
    };

    document.addEventListener('keydown', handleKeydown);
    return () => document.removeEventListener('keydown', handleKeydown);
  }, [isOpen, isGenerating, handleClose]);

  const handleNext = () => {
    setShowValidation(true);
    if (validation.isValid && currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
      setShowValidation(false); // Reset for next step
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
      setShowValidation(false); // Reset validation when going back
    }
  };

  const handleStepClick = (stepIndex: number) => {
    if (stepIndex <= currentStep) {
      setCurrentStep(stepIndex);
    }
  };

  const updateProjectData = (updates: Partial<ProjectWizardData>) => {
    setProjectData(prev => ({
      ...prev,
      ...updates
    }));
  };

  // Fetch GitHub repositories using the PAT
  const fetchGitHubRepos = async (pat: string) => {
    if (!pat || pat.trim() === '') {
      setGithubError('Please enter a GitHub Personal Access Token');
      return;
    }

    setLoadingRepos(true);
    setGithubError(null);

    try {
      const response = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated', {
        headers: {
          'Authorization': `Bearer ${pat}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Invalid GitHub token. Please check your Personal Access Token.');
        }
        throw new Error(`GitHub API error: ${response.statusText}`);
      }

      const repos: GitHubRepo[] = await response.json();
      setGithubRepos(repos);

      if (repos.length === 0) {
        setGithubError('No repositories found. Make sure your token has the "repo" scope.');
      }
    } catch (error) {
      console.error('Failed to fetch GitHub repos:', error);
      setGithubError(error instanceof Error ? error.message : 'Failed to fetch repositories');
      setGithubRepos([]);
    } finally {
      setLoadingRepos(false);
    }
  };

  // Fetch branches for a selected repository
  const fetchGitHubBranches = async (repoFullName: string, pat: string) => {
    if (!pat || !repoFullName) return;

    setLoadingBranches(true);
    setGithubError(null);

    try {
      const response = await fetch(`https://api.github.com/repos/${repoFullName}/branches`, {
        headers: {
          'Authorization': `Bearer ${pat}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch branches: ${response.statusText}`);
      }

      const branches: GitHubBranch[] = await response.json();
      setGithubBranches(branches);
    } catch (error) {
      console.error('Failed to fetch GitHub branches:', error);
      setGithubError(error instanceof Error ? error.message : 'Failed to fetch branches');
      setGithubBranches([]);
    } finally {
      setLoadingBranches(false);
    }
  };

  const handleComplete = async () => {
    if (!validation.isValid) return;

    setIsGenerating(true);

    try {
      // Get auth token
      const token = await getToken();

      if (projectData.creationType === 'github-import') {
        // GitHub Import Flow
        setGenerationProgress({
          status: 'initializing',
          progress: 0,
          currentStep: 'Importing from GitHub...',
          previewUrl: null,
          tasks: [
            { name: 'Create project database entry', status: 'in_progress', progress: 0 },
            { name: 'Clone GitHub repository', status: 'pending', progress: 0 },
            { name: 'Sync files to virtual file system', status: 'pending', progress: 0 },
            { name: 'Initialize Daytona workspace', status: 'pending', progress: 0 },
            { name: 'Finalize and verify', status: 'pending', progress: 0 },
          ]
        });

        // Create project with GitHub import parameters
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/projects`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            name: projectData.githubImport?.repoFullName?.split('/')[1] || 'Imported Project',
            description: `Imported from GitHub: ${projectData.githubImport?.repoFullName}`,
            template: 'github-import',
            importFromGitHub: true,
            githubPat: projectData.githubImport?.pat,
            githubRepoFullName: projectData.githubImport?.repoFullName,
            githubBranch: projectData.githubImport?.branch,
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to import project: ${errorText}`);
        }

        const result = await response.json();
        const projectId = result.project?.id;

        if (!projectId) {
          throw new Error('No project ID returned');
        }

        // Update progress - mark all as completed for GitHub import
        setGenerationProgress({
          status: 'completed',
          progress: 100,
          currentStep: 'GitHub repository imported successfully!',
          previewUrl: null,
          tasks: [
            { name: 'Create project database entry', status: 'completed', progress: 100 },
            { name: 'Clone GitHub repository', status: 'completed', progress: 100 },
            { name: 'Sync files to virtual file system', status: 'completed', progress: 100 },
            { name: 'Initialize Daytona workspace', status: 'completed', progress: 100 },
            { name: 'Finalize and verify', status: 'completed', progress: 100 },
          ]
        });

        // Navigate to editor after a brief delay
        setTimeout(() => {
          if (onComplete) {
            onComplete(projectId);
          }
        }, 2000);

      } else {
        // New Project Flow (AI Generation)
        setGenerationProgress({
          status: 'initializing',
          progress: 0,
          currentStep: 'Creating project...',
          previewUrl: null,
          tasks: [
            { name: 'Create project database entry', status: 'in_progress', progress: 0 },
            { name: 'Initialize Daytona workspace', status: 'pending', progress: 0 },
            { name: 'Generate project structure', status: 'pending', progress: 0 },
            { name: 'Create configuration files', status: 'pending', progress: 0 },
            { name: 'Generate application code', status: 'pending', progress: 0 },
            { name: 'Finalize and verify', status: 'pending', progress: 0 },
          ]
        });

        // Call API to create project with wizard data
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/projects`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            name: projectData.vision.name,
            description: projectData.vision.description,
            template: projectData.techStack.selectedTemplate,
            wizardData: projectData,
            generateCode: true // Enable code generation
          })
        });

        if (!response.ok) {
          throw new Error('Failed to create project');
        }

        const result = await response.json();
        const projectId = result.project?.id;

        if (!projectId) {
          throw new Error('No project ID returned');
        }

        // Mark first task as complete
        setGenerationProgress(prev => ({
          ...prev,
          progress: 10,
          currentStep: 'Project created, starting generation...',
          tasks: prev.tasks.map((t, i) => i === 0 ? { ...t, status: 'completed', progress: 100 } : t)
        }));

        // Start polling for progress
        await pollGenerationProgress(projectId, token);

        // When complete, navigate to editor
        if (onComplete) {
          onComplete(projectId);
        }
      }
    } catch (error) {
      console.error('Failed to create project:', error);
      setGenerationProgress(prev => ({
        ...prev,
        status: 'failed',
        currentStep: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
      }));
      setIsGenerating(false);
    }
  };

  const pollGenerationProgress = async (projectId: string, token: string | null) => {
    const maxAttempts = 300; // 5 minutes (300 * 1000ms)
    let attempts = 0;

    const poll = async (): Promise<void> => {
      if (attempts >= maxAttempts) {
        throw new Error('Generation timeout - taking longer than expected');
      }

      attempts++;

      try {
        const status = await api.getGenerationStatus(projectId);

        // Update progress state
        setGenerationProgress(prev => ({
          ...prev,
          status: status.status,
          progress: status.progress || 0,
          currentStep: status.currentStep || 'Processing...',
          tasks: mapStatusToTasks(status)
        }));

        // Check if generation is complete or failed
        if (status.status === 'completed') {
          // Fetch final project details to get preview URL
          const projectResponse = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL}/projects/${projectId}`,
            {
              headers: {
                'Authorization': `Bearer ${token}`,
              },
            }
          );

          if (projectResponse.ok) {
            const projectDetails = await projectResponse.json();
            setGenerationProgress(prev => ({
              ...prev,
              previewUrl: projectDetails.project?.deployment_url
            }));
          }

          return; // Done!
        } else if (status.status === 'failed') {
          throw new Error(status.error || 'Generation failed');
        }

        // Continue polling
        await new Promise(resolve => setTimeout(resolve, 1000));
        return poll();
      } catch (error) {
        console.error('Error polling generation status:', error);
        throw error;
      }
    };

    await poll();
  };

  const mapStatusToTasks = (status: any) => {
    const baseProgress = status.progress || 0;

    return [
      { name: 'Create project database entry', status: 'completed' as const, progress: 100 },
      {
        name: 'Initialize Daytona workspace',
        status: baseProgress > 5 ? 'completed' as const : baseProgress > 0 ? 'in_progress' as const : 'pending' as const,
        progress: Math.min(100, baseProgress * 20)
      },
      {
        name: 'Generate project structure',
        status: baseProgress > 20 ? 'completed' as const : baseProgress > 10 ? 'in_progress' as const : 'pending' as const,
        progress: Math.min(100, Math.max(0, (baseProgress - 10) * 10))
      },
      {
        name: 'Create configuration files',
        status: baseProgress > 40 ? 'completed' as const : baseProgress > 30 ? 'in_progress' as const : 'pending' as const,
        progress: Math.min(100, Math.max(0, (baseProgress - 30) * 10))
      },
      {
        name: 'Generate application code',
        status: baseProgress > 70 ? 'completed' as const : baseProgress > 50 ? 'in_progress' as const : 'pending' as const,
        progress: Math.min(100, Math.max(0, (baseProgress - 50) * 5))
      },
      {
        name: 'Finalize and verify',
        status: baseProgress >= 95 ? 'completed' as const : baseProgress > 80 ? 'in_progress' as const : 'pending' as const,
        progress: Math.min(100, Math.max(0, (baseProgress - 80) * 5))
      },
    ];
  };

  const renderGenerationProgress = () => {
    return (
      <div style={{
        padding: 'var(--vf-space-8)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--vf-space-6)',
        height: '100%',
        minHeight: '400px'
      }}>
        {/* Header */}
        <div style={{
          textAlign: 'center',
          paddingBottom: 'var(--vf-space-4)',
          borderBottom: '2px solid var(--vf-border-primary)'
        }}>
          <h2 style={{
            fontFamily: 'var(--vf-font-display)',
            fontSize: 'var(--vf-text-2xl)',
            fontWeight: 'var(--vf-weight-bold)',
            letterSpacing: '0.05em',
            marginBottom: 'var(--vf-space-2)',
            color: 'var(--vf-accent-primary)'
          }}>
            GENERATING YOUR PROJECT
          </h2>
          <p style={{
            color: 'var(--vf-text-secondary)',
            fontSize: 'var(--vf-text-sm)',
            margin: 0
          }}>
            {generationProgress.currentStep || 'Initializing...'}
          </p>
        </div>

        {/* Overall Progress Bar */}
        <div style={{
          background: 'var(--vf-bg-primary)',
          border: '2px solid var(--vf-border-primary)',
          padding: 'var(--vf-space-4)'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: 'var(--vf-space-2)',
            fontSize: 'var(--vf-text-sm)',
            fontWeight: 'var(--vf-weight-bold)',
            fontFamily: 'var(--vf-font-display)',
            color: 'var(--vf-text-primary)'
          }}>
            <span>OVERALL PROGRESS</span>
            <span>{Math.round(generationProgress.progress)}%</span>
          </div>
          <div style={{
            height: '8px',
            background: 'var(--vf-bg-tertiary)',
            border: '1px solid var(--vf-border-primary)',
            position: 'relative' as const,
            overflow: 'hidden'
          }}>
            <div style={{
              position: 'absolute' as const,
              left: 0,
              top: 0,
              bottom: 0,
              width: `${generationProgress.progress}%`,
              background: 'var(--vf-accent-primary)',
              transition: 'width 0.3s ease'
            }} />
          </div>
        </div>

        {/* Task List */}
        <div style={{
          flex: 1,
          overflowY: 'auto' as const,
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--vf-space-3)'
        }}>
          {generationProgress.tasks.map((task, index) => (
            <div
              key={index}
              style={{
                background: task.status === 'in_progress' ? 'var(--vf-bg-elevated)' : 'var(--vf-bg-secondary)',
                border: `2px solid ${
                  task.status === 'completed' ? 'var(--vf-accent-primary)' :
                  task.status === 'in_progress' ? 'var(--vf-accent-secondary)' :
                  task.status === 'failed' ? 'var(--vf-accent-danger)' :
                  'var(--vf-border-primary)'
                }`,
                padding: 'var(--vf-space-4)',
                transition: 'all 0.3s ease'
              }}
            >
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--vf-space-3)',
                marginBottom: task.status === 'in_progress' ? 'var(--vf-space-2)' : 0
              }}>
                {/* Status Icon */}
                <div style={{
                  width: '24px',
                  height: '24px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  {task.status === 'completed' ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--vf-accent-primary)" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : task.status === 'in_progress' ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--vf-accent-secondary)" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                      <circle cx="12" cy="12" r="10" strokeDasharray="60" strokeDashoffset="20" />
                    </svg>
                  ) : task.status === 'failed' ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--vf-accent-danger)" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M15 9l-6 6M9 9l6 6" />
                    </svg>
                  ) : (
                    <div style={{
                      width: '12px',
                      height: '12px',
                      border: '2px solid var(--vf-border-primary)',
                      borderRadius: '50%'
                    }} />
                  )}
                </div>

                {/* Task Name */}
                <span style={{
                  flex: 1,
                  fontSize: 'var(--vf-text-base)',
                  fontWeight: task.status === 'in_progress' ? 'var(--vf-weight-bold)' : 'var(--vf-weight-medium)',
                  color: task.status === 'pending' ? 'var(--vf-text-muted)' : 'var(--vf-text-primary)',
                  fontFamily: 'var(--vf-font-mono)'
                }}>
                  {task.name}
                </span>

                {/* Progress Percentage */}
                {task.status === 'in_progress' && task.progress !== undefined && (
                  <span style={{
                    fontSize: 'var(--vf-text-sm)',
                    fontWeight: 'var(--vf-weight-bold)',
                    fontFamily: 'var(--vf-font-mono)',
                    color: 'var(--vf-accent-secondary)'
                  }}>
                    {Math.round(task.progress)}%
                  </span>
                )}
              </div>

              {/* Progress Bar for In-Progress Tasks */}
              {task.status === 'in_progress' && task.progress !== undefined && (
                <div style={{
                  height: '4px',
                  background: 'var(--vf-bg-primary)',
                  border: '1px solid var(--vf-border-primary)',
                  marginTop: 'var(--vf-space-2)',
                  position: 'relative' as const,
                  overflow: 'hidden'
                }}>
                  <div style={{
                    position: 'absolute' as const,
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: `${task.progress}%`,
                    background: 'var(--vf-accent-secondary)',
                    transition: 'width 0.3s ease'
                  }} />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* No Preview URL Section */}
        {generationProgress.status === 'completed' && !generationProgress.previewUrl && (
          <div style={{
            background: 'var(--vf-bg-elevated)',
            border: '2px solid var(--vf-accent-secondary)',
            padding: 'var(--vf-space-6)',
            marginTop: 'var(--vf-space-4)'
          }}>
            <div style={{
              textAlign: 'center',
              marginBottom: 'var(--vf-space-4)'
            }}>
              <h3 style={{
                fontFamily: 'var(--vf-font-display)',
                fontSize: 'var(--vf-text-xl)',
                fontWeight: 'var(--vf-weight-bold)',
                color: 'var(--vf-accent-secondary)',
                marginBottom: 'var(--vf-space-2)'
              }}>
                PROJECT GENERATED SUCCESSFULLY
              </h3>
              <p style={{
                color: 'var(--vf-text-secondary)',
                fontSize: 'var(--vf-text-sm)',
                margin: 0
              }}>
                Your project code is ready, but no preview URL is available
              </p>
            </div>

            <div style={{
              background: 'var(--vf-bg-secondary)',
              border: '2px solid var(--vf-border-primary)',
              padding: 'var(--vf-space-4)',
              marginBottom: 'var(--vf-space-4)'
            }}>
              <p style={{
                color: 'var(--vf-text-primary)',
                fontSize: 'var(--vf-text-sm)',
                margin: '0 0 var(--vf-space-3) 0'
              }}>
                <strong>Why no preview?</strong>
              </p>
              <ul style={{
                listStyle: 'disc',
                paddingLeft: 'var(--vf-space-6)',
                margin: 0,
                color: 'var(--vf-text-secondary)',
                fontSize: 'var(--vf-text-sm)'
              }}>
                <li>The project may require manual configuration</li>
                <li>Environment variables may need to be set</li>
                <li>The dev server may need additional setup</li>
              </ul>
            </div>

            <button
              style={{
                width: '100%',
                padding: 'var(--vf-space-4)',
                background: 'var(--vf-accent-primary)',
                border: '2px solid var(--vf-accent-primary)',
                color: 'var(--vf-bg-primary)',
                fontFamily: 'var(--vf-font-display)',
                fontSize: 'var(--vf-text-base)',
                fontWeight: 'var(--vf-weight-bold)',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              onClick={handleClose}
              onMouseOver={(e) => {
                e.currentTarget.style.background = 'var(--vf-bg-primary)';
                e.currentTarget.style.color = 'var(--vf-accent-primary)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = 'var(--vf-accent-primary)';
                e.currentTarget.style.color = 'var(--vf-bg-primary)';
              }}
            >
              OPEN PROJECT FILES
            </button>
          </div>
        )}

        {/* Preview URL Section */}
        {generationProgress.status === 'completed' && generationProgress.previewUrl && (
          <div style={{
            background: 'var(--vf-bg-elevated)',
            border: '2px solid var(--vf-accent-primary)',
            padding: 'var(--vf-space-6)',
            marginTop: 'var(--vf-space-4)'
          }}>
            <div style={{
              textAlign: 'center',
              marginBottom: 'var(--vf-space-4)'
            }}>
              <h3 style={{
                fontFamily: 'var(--vf-font-display)',
                fontSize: 'var(--vf-text-xl)',
                fontWeight: 'var(--vf-weight-bold)',
                color: 'var(--vf-accent-primary)',
                marginBottom: 'var(--vf-space-2)'
              }}>
                PROJECT DEPLOYED SUCCESSFULLY
              </h3>
              <p style={{
                color: 'var(--vf-text-secondary)',
                fontSize: 'var(--vf-text-sm)',
                margin: 0
              }}>
                Your app is live and ready to view
              </p>
            </div>

            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--vf-space-3)'
            }}>
              <a
                href={generationProgress.previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'block',
                  padding: 'var(--vf-space-4)',
                  background: 'var(--vf-bg-primary)',
                  border: '2px solid var(--vf-border-primary)',
                  textAlign: 'center',
                  textDecoration: 'none',
                  color: 'var(--vf-accent-primary)',
                  fontFamily: 'var(--vf-font-mono)',
                  fontSize: 'var(--vf-text-sm)',
                  transition: 'all 0.2s ease',
                  cursor: 'pointer'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = 'var(--vf-accent-primary)';
                  e.currentTarget.style.color = 'var(--vf-bg-primary)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = 'var(--vf-bg-primary)';
                  e.currentTarget.style.color = 'var(--vf-accent-primary)';
                }}
              >
                🚀 OPEN PREVIEW → {generationProgress.previewUrl}
              </a>

              <button
                style={{
                  padding: 'var(--vf-space-4)',
                  background: 'var(--vf-accent-primary)',
                  border: '2px solid var(--vf-accent-primary)',
                  color: 'var(--vf-bg-primary)',
                  fontFamily: 'var(--vf-font-display)',
                  fontSize: 'var(--vf-text-base)',
                  fontWeight: 'var(--vf-weight-bold)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onClick={handleClose}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = 'var(--vf-bg-primary)';
                  e.currentTarget.style.color = 'var(--vf-accent-primary)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = 'var(--vf-accent-primary)';
                  e.currentTarget.style.color = 'var(--vf-bg-primary)';
                }}
              >
                CONTINUE TO PROJECT
              </button>
            </div>
          </div>
        )}

        {/* Add spin animation */}
        <style jsx>{`
          @keyframes spin {
            from {
              transform: rotate(0deg);
            }
            to {
              transform: rotate(360deg);
            }
          }
        `}</style>
      </div>
    );
  };

  const renderCreationTypeStep = () => {
    return (
      <div style={{ padding: 'var(--vf-space-8)', display: 'flex', flexDirection: 'column', gap: 'var(--vf-space-6)' }}>
        <div style={{ textAlign: 'center', marginBottom: 'var(--vf-space-4)' }}>
          <h3 style={{
            fontFamily: 'var(--vf-font-display)',
            fontSize: 'var(--vf-text-2xl)',
            fontWeight: 'var(--vf-weight-bold)',
            color: 'var(--vf-accent-primary)',
            marginBottom: 'var(--vf-space-2)',
            letterSpacing: '0.05em',
            textTransform: 'uppercase'
          }}>
            HOW WOULD YOU LIKE TO CREATE YOUR PROJECT?
          </h3>
          <p style={{ color: 'var(--vf-text-secondary)', fontSize: 'var(--vf-text-base)' }}>
            Start fresh with AI-powered generation or import an existing repository
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--vf-space-6)', marginTop: 'var(--vf-space-4)' }}>
          {/* New Project Option */}
          <div
            onClick={() => updateProjectData({ creationType: 'new' })}
            style={{
              border: `3px solid ${projectData.creationType === 'new' ? 'var(--vf-accent-primary)' : 'var(--vf-border-primary)'}`,
              background: projectData.creationType === 'new' ? 'var(--vf-bg-elevated)' : 'var(--vf-bg-secondary)',
              padding: 'var(--vf-space-8)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 'var(--vf-space-4)',
              position: 'relative' as const
            }}
            onMouseEnter={(e) => {
              if (projectData.creationType !== 'new') {
                e.currentTarget.style.borderColor = 'var(--vf-accent-secondary)';
                e.currentTarget.style.background = 'var(--vf-bg-elevated)';
              }
            }}
            onMouseLeave={(e) => {
              if (projectData.creationType !== 'new') {
                e.currentTarget.style.borderColor = 'var(--vf-border-primary)';
                e.currentTarget.style.background = 'var(--vf-bg-secondary)';
              }
            }}
          >
            {projectData.creationType === 'new' && (
              <div style={{
                position: 'absolute' as const,
                top: 'var(--vf-space-3)',
                right: 'var(--vf-space-3)',
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                background: 'var(--vf-accent-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--vf-bg-primary)" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
            )}
            <div style={{
              width: '80px',
              height: '80px',
              border: '2px solid var(--vf-accent-primary)',
              background: 'var(--vf-bg-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--vf-accent-primary)" strokeWidth="2">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </div>
            <div style={{ textAlign: 'center' }}>
              <h4 style={{
                fontFamily: 'var(--vf-font-display)',
                fontSize: 'var(--vf-text-xl)',
                fontWeight: 'var(--vf-weight-bold)',
                color: 'var(--vf-text-primary)',
                marginBottom: 'var(--vf-space-2)',
                letterSpacing: '0.05em',
                textTransform: 'uppercase'
              }}>
                CREATE NEW PROJECT
              </h4>
              <p style={{
                color: 'var(--vf-text-secondary)',
                fontSize: 'var(--vf-text-sm)',
                lineHeight: '1.6',
                margin: 0
              }}>
                Start from scratch with AI-powered code generation. Define your vision and let Claude build your project structure, configuration, and initial codebase.
              </p>
            </div>
            <div style={{
              marginTop: 'auto',
              padding: 'var(--vf-space-3)',
              background: 'var(--vf-bg-primary)',
              border: '1px solid var(--vf-border-primary)',
              width: '100%',
              textAlign: 'center'
            }}>
              <span style={{
                fontSize: 'var(--vf-text-xs)',
                color: 'var(--vf-text-muted)',
                fontFamily: 'var(--vf-font-mono)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                AI-Powered Generation
              </span>
            </div>
          </div>

          {/* GitHub Import Option */}
          <div
            onClick={() => updateProjectData({ creationType: 'github-import' })}
            style={{
              border: `3px solid ${projectData.creationType === 'github-import' ? 'var(--vf-accent-primary)' : 'var(--vf-border-primary)'}`,
              background: projectData.creationType === 'github-import' ? 'var(--vf-bg-elevated)' : 'var(--vf-bg-secondary)',
              padding: 'var(--vf-space-8)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 'var(--vf-space-4)',
              position: 'relative' as const
            }}
            onMouseEnter={(e) => {
              if (projectData.creationType !== 'github-import') {
                e.currentTarget.style.borderColor = 'var(--vf-accent-secondary)';
                e.currentTarget.style.background = 'var(--vf-bg-elevated)';
              }
            }}
            onMouseLeave={(e) => {
              if (projectData.creationType !== 'github-import') {
                e.currentTarget.style.borderColor = 'var(--vf-border-primary)';
                e.currentTarget.style.background = 'var(--vf-bg-secondary)';
              }
            }}
          >
            {projectData.creationType === 'github-import' && (
              <div style={{
                position: 'absolute' as const,
                top: 'var(--vf-space-3)',
                right: 'var(--vf-space-3)',
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                background: 'var(--vf-accent-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--vf-bg-primary)" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
            )}
            <div style={{
              width: '80px',
              height: '80px',
              border: '2px solid var(--vf-accent-secondary)',
              background: 'var(--vf-bg-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--vf-accent-secondary)" strokeWidth="2">
                <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
              </svg>
            </div>
            <div style={{ textAlign: 'center' }}>
              <h4 style={{
                fontFamily: 'var(--vf-font-display)',
                fontSize: 'var(--vf-text-xl)',
                fontWeight: 'var(--vf-weight-bold)',
                color: 'var(--vf-text-primary)',
                marginBottom: 'var(--vf-space-2)',
                letterSpacing: '0.05em',
                textTransform: 'uppercase'
              }}>
                IMPORT FROM GITHUB
              </h4>
              <p style={{
                color: 'var(--vf-text-secondary)',
                fontSize: 'var(--vf-text-sm)',
                lineHeight: '1.6',
                margin: 0
              }}>
                Import an existing repository from GitHub. Select a repo and branch to clone into your Vaporform workspace and continue development with AI assistance.
              </p>
            </div>
            <div style={{
              marginTop: 'auto',
              padding: 'var(--vf-space-3)',
              background: 'var(--vf-bg-primary)',
              border: '1px solid var(--vf-border-primary)',
              width: '100%',
              textAlign: 'center'
            }}>
              <span style={{
                fontSize: 'var(--vf-text-xs)',
                color: 'var(--vf-text-muted)',
                fontFamily: 'var(--vf-font-mono)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                GitHub Repository Sync
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderGitHubImportStep = () => {
    return (
      <div style={{ padding: 'var(--vf-space-8)', display: 'flex', flexDirection: 'column', gap: 'var(--vf-space-6)' }}>
        <div style={{ textAlign: 'center', marginBottom: 'var(--vf-space-4)' }}>
          <h3 style={{
            fontFamily: 'var(--vf-font-display)',
            fontSize: 'var(--vf-text-2xl)',
            fontWeight: 'var(--vf-weight-bold)',
            color: 'var(--vf-accent-primary)',
            marginBottom: 'var(--vf-space-2)',
            letterSpacing: '0.05em',
            textTransform: 'uppercase'
          }}>
            GITHUB REPOSITORY DETAILS
          </h3>
          <p style={{ color: 'var(--vf-text-secondary)', fontSize: 'var(--vf-text-base)' }}>
            Provide your GitHub Personal Access Token and repository information
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--vf-space-5)', maxWidth: '600px', margin: '0 auto', width: '100%' }}>
          {/* PAT Field */}
          <div>
            <label style={{
              display: 'block',
              marginBottom: 'var(--vf-space-2)',
              fontFamily: 'var(--vf-font-display)',
              fontSize: 'var(--vf-text-sm)',
              fontWeight: 'var(--vf-weight-bold)',
              color: 'var(--vf-text-primary)',
              letterSpacing: '0.05em',
              textTransform: 'uppercase'
            }}>
              GITHUB PERSONAL ACCESS TOKEN *
            </label>
            <input
              type="password"
              value={projectData.githubImport?.pat || ''}
              onChange={(e) => updateProjectData({
                githubImport: { ...projectData.githubImport, pat: e.target.value }
              })}
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
              style={{
                width: '100%',
                padding: 'var(--vf-space-3)',
                background: 'var(--vf-bg-primary)',
                border: '2px solid var(--vf-border-primary)',
                color: 'var(--vf-text-primary)',
                fontFamily: 'var(--vf-font-mono)',
                fontSize: 'var(--vf-text-sm)',
                outline: 'none',
                transition: 'border-color 0.2s ease'
              }}
              onFocus={(e) => e.currentTarget.style.borderColor = 'var(--vf-accent-primary)'}
              onBlur={(e) => e.currentTarget.style.borderColor = 'var(--vf-border-primary)'}
            />
            <p style={{
              marginTop: 'var(--vf-space-2)',
              fontSize: 'var(--vf-text-xs)',
              color: 'var(--vf-text-muted)',
              fontFamily: 'var(--vf-font-mono)'
            }}>
              Need a token? Create one at: <a href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--vf-accent-secondary)', textDecoration: 'underline' }}>github.com/settings/tokens</a>
            </p>
          </div>

          {/* Repository Field */}
          <div>
            <label style={{
              display: 'block',
              marginBottom: 'var(--vf-space-2)',
              fontFamily: 'var(--vf-font-display)',
              fontSize: 'var(--vf-text-sm)',
              fontWeight: 'var(--vf-weight-bold)',
              color: 'var(--vf-text-primary)',
              letterSpacing: '0.05em',
              textTransform: 'uppercase'
            }}>
              REPOSITORY (username/repo) *
            </label>
            <input
              type="text"
              value={projectData.githubImport?.repoFullName || ''}
              onChange={(e) => updateProjectData({
                githubImport: { ...projectData.githubImport, repoFullName: e.target.value }
              })}
              placeholder="username/repository-name"
              style={{
                width: '100%',
                padding: 'var(--vf-space-3)',
                background: 'var(--vf-bg-primary)',
                border: '2px solid var(--vf-border-primary)',
                color: 'var(--vf-text-primary)',
                fontFamily: 'var(--vf-font-mono)',
                fontSize: 'var(--vf-text-sm)',
                outline: 'none',
                transition: 'border-color 0.2s ease'
              }}
              onFocus={(e) => e.currentTarget.style.borderColor = 'var(--vf-accent-primary)'}
              onBlur={(e) => e.currentTarget.style.borderColor = 'var(--vf-border-primary)'}
            />
          </div>

          {/* Branch Field */}
          <div>
            <label style={{
              display: 'block',
              marginBottom: 'var(--vf-space-2)',
              fontFamily: 'var(--vf-font-display)',
              fontSize: 'var(--vf-text-sm)',
              fontWeight: 'var(--vf-weight-bold)',
              color: 'var(--vf-text-primary)',
              letterSpacing: '0.05em',
              textTransform: 'uppercase'
            }}>
              BRANCH NAME *
            </label>
            <input
              type="text"
              value={projectData.githubImport?.branch || ''}
              onChange={(e) => updateProjectData({
                githubImport: { ...projectData.githubImport, branch: e.target.value }
              })}
              placeholder="main"
              style={{
                width: '100%',
                padding: 'var(--vf-space-3)',
                background: 'var(--vf-bg-primary)',
                border: '2px solid var(--vf-border-primary)',
                color: 'var(--vf-text-primary)',
                fontFamily: 'var(--vf-font-mono)',
                fontSize: 'var(--vf-text-sm)',
                outline: 'none',
                transition: 'border-color 0.2s ease'
              }}
              onFocus={(e) => e.currentTarget.style.borderColor = 'var(--vf-accent-primary)'}
              onBlur={(e) => e.currentTarget.style.borderColor = 'var(--vf-border-primary)'}
            />
          </div>

          {/* Info Box */}
          <div style={{
            marginTop: 'var(--vf-space-4)',
            padding: 'var(--vf-space-4)',
            background: 'var(--vf-bg-primary)',
            border: '2px solid var(--vf-border-primary)'
          }}>
            <h4 style={{
              fontFamily: 'var(--vf-font-display)',
              fontSize: 'var(--vf-text-sm)',
              fontWeight: 'var(--vf-weight-bold)',
              color: 'var(--vf-accent-primary)',
              marginBottom: 'var(--vf-space-2)',
              letterSpacing: '0.05em',
              textTransform: 'uppercase'
            }}>
              WHAT HAPPENS NEXT?
            </h4>
            <ul style={{
              margin: 0,
              paddingLeft: 'var(--vf-space-5)',
              fontSize: 'var(--vf-text-sm)',
              color: 'var(--vf-text-secondary)',
              lineHeight: '1.8'
            }}>
              <li>Your repository will be cloned to Vaporform</li>
              <li>Files will be synced to the virtual file system</li>
              <li>A Daytona workspace will be created</li>
              <li>You'll have full AI-powered development capabilities</li>
            </ul>
          </div>
        </div>
      </div>
    );
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return renderCreationTypeStep();
      case 1:
        if (projectData.creationType === 'github-import') {
          return renderGitHubPATStep(
            projectData.githubImport?.pat || '',
            (pat) => updateProjectData({ githubImport: { ...projectData.githubImport, pat } }),
            () => fetchGitHubRepos(projectData.githubImport?.pat || ''),
            loadingRepos,
            githubError
          );
        }
        return <ProjectVisionStep projectData={projectData} updateProjectData={updateProjectData} />;
      case 2:
        if (projectData.creationType === 'github-import') {
          return renderRepositorySelectionStep(
            githubRepos,
            projectData.githubImport?.selectedRepo,
            (repo) => {
              updateProjectData({
                githubImport: {
                  ...projectData.githubImport,
                  selectedRepo: repo,
                  repoFullName: repo.full_name
                }
              });
              fetchGitHubBranches(repo.full_name, projectData.githubImport?.pat || '');
            },
            loadingRepos
          );
        }
        return <TechStackStep projectData={projectData} updateProjectData={updateProjectData} />;
      case 3:
        if (projectData.creationType === 'github-import') {
          return renderBranchSelectionStep(
            githubBranches,
            projectData.githubImport?.branch,
            projectData.githubImport?.selectedRepo?.default_branch || 'main',
            (branch) => updateProjectData({ githubImport: { ...projectData.githubImport, branch } }),
            loadingBranches
          );
        }
        return <IntegrationsStep projectData={projectData} updateProjectData={updateProjectData} />;
      case 4:
        return <ReviewStep projectData={projectData} onGenerate={handleComplete} isGenerating={isGenerating} />;
      default:
        return renderCreationTypeStep();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className={`vf-project-modal-overlay ${isClosing ? 'closing' : ''}`}
      onClick={handleBackdropClick}
    >
      <div className={`vf-project-modal-container ${isClosing ? 'closing' : ''}`}>
        {/* Header */}
        <div className="vf-project-modal-header">
          <h2 className="vf-project-modal-title">CREATE NEW PROJECT</h2>
          <button
            className="vf-project-modal-close-btn"
            onClick={handleClose}
            disabled={isGenerating}
          >
            ×
          </button>
        </div>

        {/* Progress Bar */}
        <div className="vf-project-modal-progress-bar">
          <div
            className="vf-project-modal-progress-fill"
            style={{ width: `${((currentStep + 1) / STEPS.length) * 100}%` }}
          />
        </div>

        {/* Modal Body */}
        <div className="vf-project-modal-body">
          {/* Wizard Steps Sidebar */}
          <div className="vf-project-wizard-sidebar">
            {STEPS.map((step, index) => (
              <div
                key={step.id}
                className={`vf-project-step-item ${
                  index < currentStep ? 'completed' :
                  index === currentStep ? 'active' : ''
                }`}
                onClick={() => handleStepClick(index)}
                style={{ cursor: index <= currentStep ? 'pointer' : 'default' }}
              >
                <div className="vf-project-step-number">
                  {index < currentStep ? '✓' : index + 1}
                </div>
                <div className="vf-project-step-content">
                  <span className="vf-project-step-title">{step.title}</span>
                  <span className="vf-project-step-description">{step.description}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Wizard Content Area */}
          <div className="vf-project-wizard-content">
            {isGenerating ? renderGenerationProgress() : renderStepContent()}
          </div>
        </div>

        {/* Validation Errors */}
        {showValidation && !validation.isValid && validation.errors.length > 0 && (
          <div className="vf-project-modal-validation-errors">
            <h4>Please fix the following issues:</h4>
            <ul>
              {validation.errors.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Validation Warnings */}
        {showValidation && validation.warnings && validation.warnings.length > 0 && (
          <div className="vf-project-modal-validation-warnings">
            <h4>Recommendations:</h4>
            <ul>
              {validation.warnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Modal Footer */}
        <div className="vf-project-modal-footer">
          <div className="vf-project-modal-footer-info">
            Step {currentStep + 1} of {STEPS.length} • {STEPS[currentStep]?.title}
          </div>
          <div className="vf-project-modal-footer-actions">
            <button
              className="vf-btn vf-btn-secondary"
              onClick={handlePrevious}
              disabled={currentStep === 0 || isGenerating}
            >
              PREVIOUS
            </button>

            {currentStep < STEPS.length - 1 ? (
              <button
                className="vf-btn vf-btn-primary"
                onClick={handleNext}
                disabled={!validation.isValid || isGenerating}
              >
                NEXT: {STEPS[currentStep + 1]?.title.toUpperCase()}
              </button>
            ) : (
              <button
                className="vf-btn vf-btn-primary"
                onClick={handleComplete}
                disabled={!validation.isValid || isGenerating}
              >
                {isGenerating ? 'GENERATING...' : '✨ GENERATE MY PROJECT'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectCreationModal;
