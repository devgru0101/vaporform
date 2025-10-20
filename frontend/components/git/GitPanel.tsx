'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

interface GitPanelProps {
  projectId: string;
}

interface Branch {
  name: string;
  commitHash: string;
  isDefault: boolean;
}

interface Commit {
  id: string;
  commit_hash: string;
  author_name: string;
  author_email: string;
  message: string;
  timestamp: Date;
  files_changed: number;
  insertions: number;
  deletions: number;
}

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  default_branch: string;
  html_url: string;
}

export function GitPanel({ projectId }: GitPanelProps) {
  const [view, setView] = useState<'local' | 'github'>('local');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [commits, setCommits] = useState<Commit[]>([]);
  const [currentBranch, setCurrentBranch] = useState<string>('main');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // GitHub state
  const [githubConnected, setGithubConnected] = useState(false);
  const [githubPAT, setGithubPAT] = useState('');
  const [githubRepos, setGithubRepos] = useState<GitHubRepo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null);
  const [showPATInput, setShowPATInput] = useState(false);
  const [showCreateRepo, setShowCreateRepo] = useState(false);
  const [newRepoName, setNewRepoName] = useState('');
  const [newRepoPrivate, setNewRepoPrivate] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [showCreateBranch, setShowCreateBranch] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');
  const [showCommitDialog, setShowCommitDialog] = useState(false);

  useEffect(() => {
    loadBranches();
    loadCommits();
    checkGitHubConnection();
  }, [projectId]);

  async function loadBranches() {
    try {
      setLoading(true);
      const response = await api.listBranches(projectId);
      if (response.branches) {
        setBranches(response.branches);
        const defaultBranch = response.branches.find((b: Branch) => b.isDefault);
        if (defaultBranch) {
          setCurrentBranch(defaultBranch.name);
        }
      }
    } catch (err: any) {
      console.error('Failed to load branches:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadCommits() {
    try {
      const response = await api.getHistory(projectId, 20);
      if (response.commits) {
        setCommits(response.commits);
      }
    } catch (err: any) {
      console.error('Failed to load commits:', err);
    }
  }

  async function checkGitHubConnection() {
    try {
      const response = await api.getGitHubConnection(projectId);
      if (response.connected) {
        setGithubConnected(true);
        if (response.pat) {
          setGithubPAT(response.pat);
          loadGitHubRepos(response.pat);
        }
      }
    } catch (err: any) {
      console.log('No GitHub connection found');
    }
  }

  async function connectGitHub() {
    if (!githubPAT.trim()) {
      setError('Please enter a GitHub Personal Access Token');
      return;
    }

    try {
      setLoading(true);
      await api.connectGitHub(projectId, githubPAT);
      setGithubConnected(true);
      setShowPATInput(false);
      await loadGitHubRepos(githubPAT);
    } catch (err: any) {
      setError('Failed to connect to GitHub: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadGitHubRepos(pat: string) {
    try {
      const response = await api.listGitHubRepos(pat);
      if (response.repos) {
        setGithubRepos(response.repos);
      }
    } catch (err: any) {
      setError('Failed to load GitHub repositories: ' + err.message);
    }
  }

  async function createGitHubRepo() {
    if (!newRepoName.trim()) {
      setError('Please enter a repository name');
      return;
    }

    try {
      setLoading(true);
      await api.createGitHubRepo(githubPAT, newRepoName, newRepoPrivate);
      setShowCreateRepo(false);
      setNewRepoName('');
      await loadGitHubRepos(githubPAT);
    } catch (err: any) {
      setError('Failed to create repository: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function createBranch() {
    if (!newBranchName.trim()) {
      setError('Please enter a branch name');
      return;
    }

    try {
      setLoading(true);
      await api.createBranch(projectId, newBranchName);
      setShowCreateBranch(false);
      setNewBranchName('');
      await loadBranches();
    } catch (err: any) {
      setError('Failed to create branch: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function checkoutBranch(branchName: string) {
    try {
      setLoading(true);
      await api.checkoutBranch(projectId, branchName);
      setCurrentBranch(branchName);
      await loadCommits();
    } catch (err: any) {
      setError('Failed to checkout branch: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function createCommit() {
    if (!commitMessage.trim()) {
      setError('Please enter a commit message');
      return;
    }

    try {
      setLoading(true);
      await api.createCommit(projectId, commitMessage);
      setShowCommitDialog(false);
      setCommitMessage('');
      await loadCommits();

      // If GitHub is connected, push to remote
      if (githubConnected && selectedRepo) {
        await api.pushToGitHub(projectId, githubPAT, selectedRepo.full_name, currentBranch);
      }
    } catch (err: any) {
      setError('Failed to create commit: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  function formatDate(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 30) return `${diffDays}d ago`;

    return d.toLocaleDateString();
  }

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--vf-bg-tertiary)',
      color: 'var(--vf-text-primary)',
      fontFamily: 'var(--vf-font-body)'
    }}>
      {/* Header with tabs */}
      <div style={{
        display: 'flex',
        borderBottom: '2px solid var(--vf-border-primary)'
      }}>
        <button
          onClick={() => setView('local')}
          style={{
            flex: 1,
            padding: 'var(--vf-space-2)',
            background: view === 'local' ? 'var(--vf-accent-primary)' : 'var(--vf-bg-secondary)',
            color: view === 'local' ? 'var(--vf-bg-primary)' : 'var(--vf-text-secondary)',
            border: 'none',
            borderRight: '2px solid var(--vf-border-primary)',
            fontFamily: 'var(--vf-font-display)',
            fontSize: 'var(--vf-text-xs)',
            fontWeight: 'var(--vf-weight-bold)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            cursor: 'pointer',
            transition: 'all var(--vf-transition-fast)'
          }}
        >
          Local Git
        </button>
        <button
          onClick={() => setView('github')}
          style={{
            flex: 1,
            padding: 'var(--vf-space-2)',
            background: view === 'github' ? 'var(--vf-accent-primary)' : 'var(--vf-bg-secondary)',
            color: view === 'github' ? 'var(--vf-bg-primary)' : 'var(--vf-text-secondary)',
            border: 'none',
            fontFamily: 'var(--vf-font-display)',
            fontSize: 'var(--vf-text-xs)',
            fontWeight: 'var(--vf-weight-bold)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            cursor: 'pointer',
            transition: 'all var(--vf-transition-fast)'
          }}
        >
          GitHub {githubConnected && '✓'}
        </button>
      </div>

      {error && (
        <div style={{
          padding: 'var(--vf-space-2)',
          background: 'var(--vf-accent-danger)',
          color: 'var(--vf-bg-primary)',
          fontSize: 'var(--vf-text-xs)',
          borderBottom: '2px solid var(--vf-border-primary)'
        }}>
          {error}
          <button
            onClick={() => setError(null)}
            style={{
              marginLeft: 'var(--vf-space-2)',
              background: 'transparent',
              border: 'none',
              color: 'inherit',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Local Git View */}
      {view === 'local' && (
        <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
          {/* Branch selector */}
          <div style={{
            padding: 'var(--vf-space-3)',
            borderBottom: '2px solid var(--vf-border-primary)',
            background: 'var(--vf-bg-secondary)'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--vf-space-2)',
              marginBottom: 'var(--vf-space-2)'
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9l-6 6"/>
              </svg>
              <select
                value={currentBranch}
                onChange={(e) => checkoutBranch(e.target.value)}
                style={{
                  flex: 1,
                  padding: '4px 8px',
                  background: 'var(--vf-bg-primary)',
                  border: '2px solid var(--vf-border-primary)',
                  color: 'var(--vf-text-primary)',
                  fontSize: 'var(--vf-text-sm)',
                  fontFamily: 'var(--vf-font-mono)'
                }}
              >
                {branches.map((branch) => (
                  <option key={branch.name} value={branch.name}>
                    {branch.name} {branch.isDefault && '(default)'}
                  </option>
                ))}
              </select>
              <button
                onClick={() => setShowCreateBranch(true)}
                style={{
                  padding: '4px 8px',
                  background: 'var(--vf-accent-primary)',
                  border: 'none',
                  color: 'var(--vf-bg-primary)',
                  fontSize: 'var(--vf-text-xs)',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
                title="Create new branch"
              >
                +
              </button>
            </div>

            <button
              onClick={() => setShowCommitDialog(true)}
              style={{
                width: '100%',
                padding: '8px',
                background: 'var(--vf-accent-success)',
                border: 'none',
                color: 'var(--vf-bg-primary)',
                fontFamily: 'var(--vf-font-display)',
                fontSize: 'var(--vf-text-xs)',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                cursor: 'pointer'
              }}
            >
              Commit Changes
            </button>
          </div>

          {/* Commit history */}
          <div style={{ flex: 1, overflow: 'auto', padding: 'var(--vf-space-2)' }}>
            <div style={{
              fontSize: 'var(--vf-text-xs)',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              marginBottom: 'var(--vf-space-2)',
              color: 'var(--vf-text-muted)'
            }}>
              Recent Commits ({commits.length})
            </div>
            {commits.map((commit) => (
              <div
                key={commit.id}
                style={{
                  padding: 'var(--vf-space-2)',
                  marginBottom: 'var(--vf-space-2)',
                  background: 'var(--vf-bg-secondary)',
                  border: '2px solid var(--vf-border-primary)',
                  fontSize: 'var(--vf-text-xs)'
                }}
              >
                <div style={{
                  fontFamily: 'var(--vf-font-mono)',
                  color: 'var(--vf-accent-primary)',
                  marginBottom: '4px'
                }}>
                  {commit.commit_hash.substring(0, 7)}
                </div>
                <div style={{ marginBottom: '4px' }}>{commit.message}</div>
                <div style={{ color: 'var(--vf-text-muted)', fontSize: 'var(--vf-text-2xs)' }}>
                  {commit.author_name} · {formatDate(commit.timestamp)}
                  {commit.files_changed > 0 && ` · ${commit.files_changed} files`}
                </div>
              </div>
            ))}
            {commits.length === 0 && (
              <div style={{
                padding: 'var(--vf-space-4)',
                textAlign: 'center',
                color: 'var(--vf-text-muted)',
                fontSize: 'var(--vf-text-sm)'
              }}>
                No commits yet
              </div>
            )}
          </div>
        </div>
      )}

      {/* GitHub View */}
      {view === 'github' && (
        <div style={{ flex: 1, overflow: 'auto', padding: 'var(--vf-space-3)' }}>
          {!githubConnected ? (
            <div>
              <div style={{
                marginBottom: 'var(--vf-space-3)',
                fontSize: 'var(--vf-text-sm)'
              }}>
                Connect to GitHub to sync your repository and enable push/pull operations.
              </div>

              {!showPATInput ? (
                <button
                  onClick={() => setShowPATInput(true)}
                  style={{
                    width: '100%',
                    padding: '12px',
                    background: 'var(--vf-accent-primary)',
                    border: 'none',
                    color: 'var(--vf-bg-primary)',
                    fontFamily: 'var(--vf-font-display)',
                    fontSize: 'var(--vf-text-sm)',
                    fontWeight: 'bold',
                    textTransform: 'uppercase',
                    cursor: 'pointer'
                  }}
                >
                  Connect GitHub
                </button>
              ) : (
                <div>
                  <input
                    type="password"
                    placeholder="GitHub Personal Access Token"
                    value={githubPAT}
                    onChange={(e) => setGithubPAT(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px',
                      marginBottom: 'var(--vf-space-2)',
                      background: 'var(--vf-bg-primary)',
                      border: '2px solid var(--vf-border-primary)',
                      color: 'var(--vf-text-primary)',
                      fontSize: 'var(--vf-text-sm)',
                      fontFamily: 'var(--vf-font-mono)'
                    }}
                  />
                  <div style={{ display: 'flex', gap: 'var(--vf-space-2)' }}>
                    <button
                      onClick={connectGitHub}
                      disabled={loading}
                      style={{
                        flex: 1,
                        padding: '8px',
                        background: 'var(--vf-accent-success)',
                        border: 'none',
                        color: 'var(--vf-bg-primary)',
                        fontSize: 'var(--vf-text-xs)',
                        fontWeight: 'bold',
                        cursor: loading ? 'not-allowed' : 'pointer',
                        opacity: loading ? 0.5 : 1
                      }}
                    >
                      {loading ? 'Connecting...' : 'Connect'}
                    </button>
                    <button
                      onClick={() => setShowPATInput(false)}
                      style={{
                        padding: '8px 16px',
                        background: 'var(--vf-bg-secondary)',
                        border: '2px solid var(--vf-border-primary)',
                        color: 'var(--vf-text-primary)',
                        fontSize: 'var(--vf-text-xs)',
                        cursor: 'pointer'
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div>
              {/* Create repo button */}
              <button
                onClick={() => setShowCreateRepo(true)}
                style={{
                  width: '100%',
                  padding: '8px',
                  marginBottom: 'var(--vf-space-3)',
                  background: 'var(--vf-accent-primary)',
                  border: 'none',
                  color: 'var(--vf-bg-primary)',
                  fontSize: 'var(--vf-text-xs)',
                  fontWeight: 'bold',
                  textTransform: 'uppercase',
                  cursor: 'pointer'
                }}
              >
                + Create Repository
              </button>

              {/* Repository list */}
              <div style={{
                fontSize: 'var(--vf-text-xs)',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                marginBottom: 'var(--vf-space-2)',
                color: 'var(--vf-text-muted)'
              }}>
                Your Repositories ({githubRepos.length})
              </div>

              {githubRepos.map((repo) => (
                <div
                  key={repo.id}
                  onClick={() => setSelectedRepo(repo)}
                  style={{
                    padding: 'var(--vf-space-2)',
                    marginBottom: 'var(--vf-space-2)',
                    background: selectedRepo?.id === repo.id ? 'var(--vf-accent-primary)' : 'var(--vf-bg-secondary)',
                    border: '2px solid var(--vf-border-primary)',
                    color: selectedRepo?.id === repo.id ? 'var(--vf-bg-primary)' : 'var(--vf-text-primary)',
                    cursor: 'pointer',
                    fontSize: 'var(--vf-text-xs)',
                    transition: 'all var(--vf-transition-fast)'
                  }}
                >
                  <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                    {repo.name} {repo.private && '🔒'}
                  </div>
                  <div style={{ opacity: 0.7, fontSize: 'var(--vf-text-2xs)' }}>
                    {repo.full_name}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create Branch Dialog */}
      {showCreateBranch && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'var(--vf-space-4)'
        }}>
          <div style={{
            background: 'var(--vf-bg-secondary)',
            border: '2px solid var(--vf-border-primary)',
            padding: 'var(--vf-space-4)',
            width: '100%',
            maxWidth: '300px'
          }}>
            <div style={{
              fontSize: 'var(--vf-text-sm)',
              fontWeight: 'bold',
              marginBottom: 'var(--vf-space-3)'
            }}>
              Create New Branch
            </div>
            <input
              type="text"
              placeholder="Branch name"
              value={newBranchName}
              onChange={(e) => setNewBranchName(e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                marginBottom: 'var(--vf-space-3)',
                background: 'var(--vf-bg-primary)',
                border: '2px solid var(--vf-border-primary)',
                color: 'var(--vf-text-primary)',
                fontSize: 'var(--vf-text-sm)'
              }}
            />
            <div style={{ display: 'flex', gap: 'var(--vf-space-2)' }}>
              <button
                onClick={createBranch}
                disabled={loading}
                style={{
                  flex: 1,
                  padding: '8px',
                  background: 'var(--vf-accent-success)',
                  border: 'none',
                  color: 'var(--vf-bg-primary)',
                  fontSize: 'var(--vf-text-xs)',
                  fontWeight: 'bold',
                  cursor: loading ? 'not-allowed' : 'pointer'
                }}
              >
                Create
              </button>
              <button
                onClick={() => {
                  setShowCreateBranch(false);
                  setNewBranchName('');
                }}
                style={{
                  padding: '8px 16px',
                  background: 'var(--vf-bg-primary)',
                  border: '2px solid var(--vf-border-primary)',
                  color: 'var(--vf-text-primary)',
                  fontSize: 'var(--vf-text-xs)',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Commit Dialog */}
      {showCommitDialog && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'var(--vf-space-4)'
        }}>
          <div style={{
            background: 'var(--vf-bg-secondary)',
            border: '2px solid var(--vf-border-primary)',
            padding: 'var(--vf-space-4)',
            width: '100%',
            maxWidth: '400px'
          }}>
            <div style={{
              fontSize: 'var(--vf-text-sm)',
              fontWeight: 'bold',
              marginBottom: 'var(--vf-space-3)'
            }}>
              Commit Changes
            </div>
            <textarea
              placeholder="Commit message..."
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              rows={4}
              style={{
                width: '100%',
                padding: '8px',
                marginBottom: 'var(--vf-space-3)',
                background: 'var(--vf-bg-primary)',
                border: '2px solid var(--vf-border-primary)',
                color: 'var(--vf-text-primary)',
                fontSize: 'var(--vf-text-sm)',
                fontFamily: 'var(--vf-font-body)',
                resize: 'vertical'
              }}
            />
            {githubConnected && selectedRepo && (
              <div style={{
                padding: 'var(--vf-space-2)',
                marginBottom: 'var(--vf-space-2)',
                background: 'var(--vf-bg-primary)',
                border: '2px solid var(--vf-accent-success)',
                fontSize: 'var(--vf-text-xs)',
                color: 'var(--vf-accent-success)'
              }}>
                ✓ Will also push to GitHub: {selectedRepo.full_name}
              </div>
            )}
            <div style={{ display: 'flex', gap: 'var(--vf-space-2)' }}>
              <button
                onClick={createCommit}
                disabled={loading}
                style={{
                  flex: 1,
                  padding: '8px',
                  background: 'var(--vf-accent-success)',
                  border: 'none',
                  color: 'var(--vf-bg-primary)',
                  fontSize: 'var(--vf-text-xs)',
                  fontWeight: 'bold',
                  cursor: loading ? 'not-allowed' : 'pointer'
                }}
              >
                {loading ? 'Committing...' : 'Commit'}
              </button>
              <button
                onClick={() => {
                  setShowCommitDialog(false);
                  setCommitMessage('');
                }}
                style={{
                  padding: '8px 16px',
                  background: 'var(--vf-bg-primary)',
                  border: '2px solid var(--vf-border-primary)',
                  color: 'var(--vf-text-primary)',
                  fontSize: 'var(--vf-text-xs)',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create GitHub Repo Dialog */}
      {showCreateRepo && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'var(--vf-space-4)'
        }}>
          <div style={{
            background: 'var(--vf-bg-secondary)',
            border: '2px solid var(--vf-border-primary)',
            padding: 'var(--vf-space-4)',
            width: '100%',
            maxWidth: '400px'
          }}>
            <div style={{
              fontSize: 'var(--vf-text-sm)',
              fontWeight: 'bold',
              marginBottom: 'var(--vf-space-3)'
            }}>
              Create GitHub Repository
            </div>
            <input
              type="text"
              placeholder="Repository name"
              value={newRepoName}
              onChange={(e) => setNewRepoName(e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                marginBottom: 'var(--vf-space-2)',
                background: 'var(--vf-bg-primary)',
                border: '2px solid var(--vf-border-primary)',
                color: 'var(--vf-text-primary)',
                fontSize: 'var(--vf-text-sm)'
              }}
            />
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--vf-space-2)',
              marginBottom: 'var(--vf-space-3)',
              fontSize: 'var(--vf-text-sm)',
              cursor: 'pointer'
            }}>
              <input
                type="checkbox"
                checked={newRepoPrivate}
                onChange={(e) => setNewRepoPrivate(e.target.checked)}
              />
              Private repository
            </label>
            <div style={{ display: 'flex', gap: 'var(--vf-space-2)' }}>
              <button
                onClick={createGitHubRepo}
                disabled={loading}
                style={{
                  flex: 1,
                  padding: '8px',
                  background: 'var(--vf-accent-success)',
                  border: 'none',
                  color: 'var(--vf-bg-primary)',
                  fontSize: 'var(--vf-text-xs)',
                  fontWeight: 'bold',
                  cursor: loading ? 'not-allowed' : 'pointer'
                }}
              >
                Create
              </button>
              <button
                onClick={() => {
                  setShowCreateRepo(false);
                  setNewRepoName('');
                  setNewRepoPrivate(false);
                }}
                style={{
                  padding: '8px 16px',
                  background: 'var(--vf-bg-primary)',
                  border: '2px solid var(--vf-border-primary)',
                  color: 'var(--vf-text-primary)',
                  fontSize: 'var(--vf-text-xs)',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
