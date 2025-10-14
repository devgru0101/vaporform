/**
 * Shared TypeScript types and interfaces for Vaporform
 */

// User types
export interface User {
  id: bigint;
  clerk_user_id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  avatar_url?: string;
  subscription_tier: 'free' | 'pro' | 'team' | 'enterprise';
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date;
}

// Organization types
export interface Organization {
  id: bigint;
  clerk_org_id: string;
  name: string;
  slug: string;
  logo_url?: string;
  subscription_tier: 'free' | 'team' | 'enterprise';
  max_members: number;
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date;
}

export interface OrganizationMember {
  id: bigint;
  org_id: bigint;
  user_id: bigint;
  clerk_org_id: string;
  clerk_user_id: string;
  role: 'org:owner' | 'org:admin' | 'org:developer' | 'org:viewer';
  created_at: Date;
  updated_at: Date;
}

// Project types
export interface Project {
  id: bigint;
  clerk_org_id?: string;
  clerk_user_id: string;
  name: string;
  description?: string;
  template?: string;
  git_initialized: boolean;
  daytona_workspace_id?: string;
  deployment_url?: string;
  deployment_status: 'none' | 'building' | 'deployed' | 'failed';
  storage_used_bytes: bigint;
  compute_minutes_used: number;
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date;
}

// File system types
export interface FileMetadata {
  id: bigint;
  project_id: bigint;
  gridfs_file_id: string;
  path: string;
  filename: string;
  mime_type: string;
  size_bytes: bigint;
  version: number;
  is_directory: boolean;
  parent_path: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

// Git types
export interface GitCommit {
  id: bigint;
  project_id: bigint;
  commit_hash: string;
  author_name: string;
  author_email: string;
  message: string;
  parent_hash: string | null;
  timestamp: Date;
  files_changed: number;
  insertions: number;
  deletions: number;
  created_at: Date;
}

// Tech Stack types
export type PackageManager = 'npm' | 'yarn' | 'pnpm' | 'pip' | 'poetry' | 'cargo' | 'go' | 'maven' | 'gradle' | 'composer' | 'bundler' | 'none';

export type Language = 'nodejs' | 'python' | 'rust' | 'go' | 'java' | 'php' | 'ruby' | 'unknown';

export type Framework =
  // Node.js frameworks
  | 'nextjs' | 'react' | 'vue' | 'angular' | 'svelte' | 'express' | 'nestjs'
  // Python frameworks
  | 'django' | 'flask' | 'fastapi'
  // Java frameworks
  | 'maven' | 'gradle' | 'spring'
  // Generic
  | 'generic';

export interface TechStack {
  language: Language;
  framework: Framework;
  packageManager: PackageManager;
}

// AI types
export interface ChatSession {
  id: bigint;
  project_id: bigint;
  user_id: string;
  title?: string;
  created_at: Date;
  updated_at: Date;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: {
    uiContext?: UIComponentContext;
    fileContext?: string[];
  };
}

export interface UIComponentContext {
  componentName: string;
  filePath: string;
  lineNumber?: number;
  props?: Record<string, any>;
  state?: Record<string, any>;
}

export interface CodeSnippet {
  filepath: string;
  code: string;
  language: string;
  description?: string;
}

export interface DesignDecision {
  decision: string;
  rationale: string;
  alternatives?: string[];
  timestamp: Date;
}

// Workspace types
export interface DaytonaWorkspace {
  id: string;
  projectId: bigint;
  status: 'creating' | 'running' | 'stopped' | 'failed';
  previewUrl?: string;
  ports: number[];
  createdAt: Date;
  updatedAt: Date;
}

// Deployment types
export interface Deployment {
  id: bigint;
  project_id: bigint;
  container_id?: string;
  status: 'pending' | 'building' | 'running' | 'stopped' | 'failed';
  subdomain: string;
  custom_domain?: string;
  port: number;
  env_vars?: Record<string, string>;
  cpu_limit?: string;
  memory_limit?: string;
  created_at: Date;
  updated_at: Date;
}

// Subscription limits
export interface SubscriptionLimits {
  tier: 'free' | 'pro' | 'team' | 'enterprise';
  maxProjects: number;
  maxStorageBytes: bigint;
  maxComputeMinutesPerMonth: number;
  maxCollaborators?: number;
  customDomains: boolean;
  prioritySupport: boolean;
}

export const SUBSCRIPTION_LIMITS: Record<string, SubscriptionLimits> = {
  free: {
    tier: 'free',
    maxProjects: 3,
    maxStorageBytes: BigInt(1 * 1024 * 1024 * 1024), // 1GB
    maxComputeMinutesPerMonth: 10 * 60, // 10 hours
    customDomains: false,
    prioritySupport: false,
  },
  pro: {
    tier: 'pro',
    maxProjects: Infinity,
    maxStorageBytes: BigInt(10 * 1024 * 1024 * 1024), // 10GB
    maxComputeMinutesPerMonth: 100 * 60, // 100 hours
    customDomains: true,
    prioritySupport: true,
  },
  team: {
    tier: 'team',
    maxProjects: Infinity,
    maxStorageBytes: BigInt(50 * 1024 * 1024 * 1024), // 50GB
    maxComputeMinutesPerMonth: 500 * 60, // 500 hours
    maxCollaborators: Infinity,
    customDomains: true,
    prioritySupport: true,
  },
  enterprise: {
    tier: 'enterprise',
    maxProjects: Infinity,
    maxStorageBytes: BigInt(1024 * 1024 * 1024 * 1024), // 1TB
    maxComputeMinutesPerMonth: Infinity,
    maxCollaborators: Infinity,
    customDomains: true,
    prioritySupport: true,
  },
};
