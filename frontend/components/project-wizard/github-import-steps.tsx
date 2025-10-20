// GitHub Import Step Components
import React from 'react';

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

// Step 1: GitHub PAT Input
export const renderGitHubPATStep = (
  pat: string,
  onPATChange: (pat: string) => void,
  onFetchRepos: () => void,
  isLoading: boolean,
  error: string | null
) => {
  return (
    <div style={{ padding: 'var(--vf-space-8)', display: 'flex', flexDirection: 'column', gap: 'var(--vf-space-6)', maxWidth: '700px', margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 'var(--vf-space-2)' }}>
        <h3 style={{
          fontFamily: 'var(--vf-font-display)',
          fontSize: 'var(--vf-text-2xl)',
          fontWeight: 'var(--vf-weight-bold)',
          color: 'var(--vf-accent-primary)',
          marginBottom: 'var(--vf-space-2)',
          letterSpacing: '0.05em',
          textTransform: 'uppercase'
        }}>
          CONNECT YOUR GITHUB ACCOUNT
        </h3>
        <p style={{ color: 'var(--vf-text-secondary)', fontSize: 'var(--vf-text-base)' }}>
          Enter your Personal Access Token to access your repositories
        </p>
      </div>

      {/* PAT Input */}
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
          value={pat}
          onChange={(e) => onPATChange(e.target.value)}
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
          Need a token? Create one at: <a href="https://github.com/settings/tokens/new?scopes=repo" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--vf-accent-secondary)', textDecoration: 'underline' }}>github.com/settings/tokens</a>
        </p>
      </div>

      {/* Fetch Repos Button */}
      <button
        onClick={onFetchRepos}
        disabled={!pat || isLoading}
        style={{
          padding: 'var(--vf-space-4)',
          background: pat && !isLoading ? 'var(--vf-accent-primary)' : 'var(--vf-bg-tertiary)',
          border: '2px solid var(--vf-border-primary)',
          color: pat && !isLoading ? 'var(--vf-bg-primary)' : 'var(--vf-text-muted)',
          fontFamily: 'var(--vf-font-display)',
          fontSize: 'var(--vf-text-base)',
          fontWeight: 'var(--vf-weight-bold)',
          cursor: pat && !isLoading ? 'pointer' : 'not-allowed',
          transition: 'all 0.2s ease',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 'var(--vf-space-2)'
        }}
      >
        {isLoading ? (
          <>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
              <circle cx="12" cy="12" r="10" strokeDasharray="60" strokeDashoffset="20" />
            </svg>
            FETCHING REPOSITORIES...
          </>
        ) : (
          <>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
            </svg>
            LOAD MY REPOSITORIES
          </>
        )}
      </button>

      {/* Error Display */}
      {error && (
        <div style={{
          padding: 'var(--vf-space-4)',
          background: 'var(--vf-bg-primary)',
          border: '2px solid var(--vf-accent-danger)',
          color: 'var(--vf-accent-danger)',
          fontFamily: 'var(--vf-font-mono)',
          fontSize: 'var(--vf-text-sm)'
        }}>
          ⚠ {error}
        </div>
      )}

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
          TOKEN REQUIREMENTS
        </h4>
        <ul style={{
          margin: 0,
          paddingLeft: 'var(--vf-space-5)',
          fontSize: 'var(--vf-text-sm)',
          color: 'var(--vf-text-secondary)',
          lineHeight: '1.8'
        }}>
          <li>Token must have <strong>repo</strong> scope</li>
          <li>Your token is securely stored and never shared</li>
          <li>Token is only used to clone your selected repository</li>
        </ul>
      </div>

      <style jsx>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

// Step 2: Repository Selection
export const renderRepositorySelectionStep = (
  repos: GitHubRepo[],
  selectedRepo: GitHubRepo | undefined,
  onSelectRepo: (repo: GitHubRepo) => void,
  isLoading: boolean
) => {
  return (
    <div style={{ padding: 'var(--vf-space-8)', display: 'flex', flexDirection: 'column', gap: 'var(--vf-space-6)' }}>
      <div style={{ textAlign: 'center', marginBottom: 'var(--vf-space-2)' }}>
        <h3 style={{
          fontFamily: 'var(--vf-font-display)',
          fontSize: 'var(--vf-text-2xl)',
          fontWeight: 'var(--vf-weight-bold)',
          color: 'var(--vf-accent-primary)',
          marginBottom: 'var(--vf-space-2)',
          letterSpacing: '0.05em',
          textTransform: 'uppercase'
        }}>
          SELECT A REPOSITORY
        </h3>
        <p style={{ color: 'var(--vf-text-secondary)', fontSize: 'var(--vf-text-base)' }}>
          Choose the repository you want to import ({repos.length} repositories found)
        </p>
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 'var(--vf-space-12)' }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--vf-accent-primary)" strokeWidth="2" style={{ animation: 'spin 1s linear infinite', margin: '0 auto var(--vf-space-4)' }}>
            <circle cx="12" cy="12" r="10" strokeDasharray="60" strokeDashoffset="20" />
          </svg>
          <p style={{ color: 'var(--vf-text-secondary)', fontFamily: 'var(--vf-font-display)' }}>LOADING REPOSITORIES...</p>
        </div>
      ) : repos.length === 0 ? (
        <div style={{
          padding: 'var(--vf-space-8)',
          textAlign: 'center',
          background: 'var(--vf-bg-secondary)',
          border: '2px solid var(--vf-border-primary)'
        }}>
          <p style={{ color: 'var(--vf-text-muted)', fontSize: 'var(--vf-text-base)' }}>
            No repositories found. Make sure your token has the "repo" scope.
          </p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
          gap: 'var(--vf-space-4)',
          maxHeight: '500px',
          overflowY: 'auto',
          padding: 'var(--vf-space-2)'
        }}>
          {repos.map((repo) => (
            <div
              key={repo.id}
              onClick={() => onSelectRepo(repo)}
              style={{
                border: `2px solid ${selectedRepo?.id === repo.id ? 'var(--vf-accent-primary)' : 'var(--vf-border-primary)'}`,
                background: selectedRepo?.id === repo.id ? 'var(--vf-bg-elevated)' : 'var(--vf-bg-secondary)',
                padding: 'var(--vf-space-4)',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                position: 'relative' as const
              }}
              onMouseEnter={(e) => {
                if (selectedRepo?.id !== repo.id) {
                  e.currentTarget.style.borderColor = 'var(--vf-accent-secondary)';
                  e.currentTarget.style.background = 'var(--vf-bg-elevated)';
                }
              }}
              onMouseLeave={(e) => {
                if (selectedRepo?.id !== repo.id) {
                  e.currentTarget.style.borderColor = 'var(--vf-border-primary)';
                  e.currentTarget.style.background = 'var(--vf-bg-secondary)';
                }
              }}
            >
              {selectedRepo?.id === repo.id && (
                <div style={{
                  position: 'absolute' as const,
                  top: 'var(--vf-space-2)',
                  right: 'var(--vf-space-2)',
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  background: 'var(--vf-accent-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--vf-bg-primary)" strokeWidth="3">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--vf-space-2)', marginBottom: 'var(--vf-space-2)' }}>
                {repo.private ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--vf-accent-danger)" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--vf-accent-secondary)" strokeWidth="2">
                    <path d="M3 7v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7"/>
                    <path d="M3 7l9-5 9 5"/>
                  </svg>
                )}
                <h4 style={{
                  fontFamily: 'var(--vf-font-display)',
                  fontSize: 'var(--vf-text-base)',
                  fontWeight: 'var(--vf-weight-bold)',
                  color: 'var(--vf-text-primary)',
                  margin: 0,
                  letterSpacing: '0.02em'
                }}>
                  {repo.name}
                </h4>
              </div>
              <p style={{
                fontSize: 'var(--vf-text-xs)',
                color: 'var(--vf-text-muted)',
                fontFamily: 'var(--vf-font-mono)',
                marginBottom: 'var(--vf-space-2)',
                wordBreak: 'break-all' as const
              }}>
                {repo.full_name}
              </p>
              {repo.description && (
                <p style={{
                  fontSize: 'var(--vf-text-sm)',
                  color: 'var(--vf-text-secondary)',
                  margin: 0,
                  lineHeight: '1.5'
                }}>
                  {repo.description}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <style jsx>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

// Step 3: Branch Selection
export const renderBranchSelectionStep = (
  branches: GitHubBranch[],
  selectedBranch: string | undefined,
  defaultBranch: string,
  onSelectBranch: (branch: string) => void,
  isLoading: boolean
) => {
  return (
    <div style={{ padding: 'var(--vf-space-8)', display: 'flex', flexDirection: 'column', gap: 'var(--vf-space-6)', maxWidth: '700px', margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 'var(--vf-space-2)' }}>
        <h3 style={{
          fontFamily: 'var(--vf-font-display)',
          fontSize: 'var(--vf-text-2xl)',
          fontWeight: 'var(--vf-weight-bold)',
          color: 'var(--vf-accent-primary)',
          marginBottom: 'var(--vf-space-2)',
          letterSpacing: '0.05em',
          textTransform: 'uppercase'
        }}>
          SELECT A BRANCH
        </h3>
        <p style={{ color: 'var(--vf-text-secondary)', fontSize: 'var(--vf-text-base)' }}>
          Choose which branch to import ({branches.length} branches available)
        </p>
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 'var(--vf-space-12)' }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--vf-accent-primary)" strokeWidth="2" style={{ animation: 'spin 1s linear infinite', margin: '0 auto var(--vf-space-4)' }}>
            <circle cx="12" cy="12" r="10" strokeDasharray="60" strokeDashoffset="20" />
          </svg>
          <p style={{ color: 'var(--vf-text-secondary)', fontFamily: 'var(--vf-font-display)' }}>LOADING BRANCHES...</p>
        </div>
      ) : branches.length === 0 ? (
        <div style={{
          padding: 'var(--vf-space-8)',
          textAlign: 'center',
          background: 'var(--vf-bg-secondary)',
          border: '2px solid var(--vf-border-primary)'
        }}>
          <p style={{ color: 'var(--vf-text-muted)', fontSize: 'var(--vf-text-base)' }}>
            No branches found for this repository.
          </p>
        </div>
      ) : (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--vf-space-3)',
          maxHeight: '500px',
          overflowY: 'auto',
          padding: 'var(--vf-space-2)'
        }}>
          {branches.map((branch) => (
            <div
              key={branch.name}
              onClick={() => onSelectBranch(branch.name)}
              style={{
                border: `2px solid ${selectedBranch === branch.name ? 'var(--vf-accent-primary)' : 'var(--vf-border-primary)'}`,
                background: selectedBranch === branch.name ? 'var(--vf-bg-elevated)' : 'var(--vf-bg-secondary)',
                padding: 'var(--vf-space-4)',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--vf-space-3)',
                position: 'relative' as const
              }}
              onMouseEnter={(e) => {
                if (selectedBranch !== branch.name) {
                  e.currentTarget.style.borderColor = 'var(--vf-accent-secondary)';
                  e.currentTarget.style.background = 'var(--vf-bg-elevated)';
                }
              }}
              onMouseLeave={(e) => {
                if (selectedBranch !== branch.name) {
                  e.currentTarget.style.borderColor = 'var(--vf-border-primary)';
                  e.currentTarget.style.background = 'var(--vf-bg-secondary)';
                }
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={selectedBranch === branch.name ? 'var(--vf-accent-primary)' : 'var(--vf-text-secondary)'} strokeWidth="2">
                <line x1="6" y1="3" x2="6" y2="15"/>
                <circle cx="18" cy="6" r="3"/>
                <circle cx="6" cy="18" r="3"/>
                <path d="M18 9a9 9 0 0 1-9 9"/>
              </svg>
              <div style={{ flex: 1 }}>
                <span style={{
                  fontFamily: 'var(--vf-font-mono)',
                  fontSize: 'var(--vf-text-base)',
                  fontWeight: selectedBranch === branch.name ? 'var(--vf-weight-bold)' : 'var(--vf-weight-medium)',
                  color: 'var(--vf-text-primary)'
                }}>
                  {branch.name}
                </span>
                {branch.name === defaultBranch && (
                  <span style={{
                    marginLeft: 'var(--vf-space-2)',
                    padding: '2px 8px',
                    background: 'var(--vf-accent-secondary)',
                    color: 'var(--vf-bg-primary)',
                    fontSize: 'var(--vf-text-xs)',
                    fontWeight: 'var(--vf-weight-bold)',
                    fontFamily: 'var(--vf-font-display)',
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase'
                  }}>
                    DEFAULT
                  </span>
                )}
              </div>
              {selectedBranch === branch.name && (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--vf-accent-primary)" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </div>
          ))}
        </div>
      )}

      <style jsx>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};
