# GitHub Repository Import Feature

This document describes the new GitHub repository import workflow for the Vaporform project creation wizard.

## Overview

Users can now import existing GitHub repositories when creating a new project. The import process:
1. Clones the selected repository and branch
2. Syncs all files to the Vaporform VFS (Virtual File System)
3. Initializes Git tracking in Vaporform's database
4. Sets up automatic GitHub synchronization

## Backend API Endpoints

### 1. List GitHub Repositories

**Endpoint:** `POST /git/github/repos`

**Purpose:** List all repositories accessible to the user via their GitHub PAT.

**Request:**
```typescript
{
  authorization: string; // JWT Bearer token
  pat: string;           // GitHub Personal Access Token
}
```

**Response:**
```typescript
{
  repos: Array<{
    id: number;
    name: string;
    full_name: string;      // e.g., "owner/repo-name"
    private: boolean;
    default_branch: string; // e.g., "main" or "master"
    html_url: string;       // e.g., "https://github.com/owner/repo-name"
  }>;
}
```

**Example:**
```typescript
const response = await fetch('/git/github/repos', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${clerkJWT}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    pat: 'ghp_xxxxxxxxxxxxxxxxxxxx',
  }),
});

const { repos } = await response.json();
```

### 2. Get Branches for a Repository

**Endpoint:** `POST /git/github/branches`

**Purpose:** List all branches for a specific repository.

**Request:**
```typescript
{
  authorization: string; // JWT Bearer token
  pat: string;           // GitHub Personal Access Token
  repoFullName: string;  // e.g., "owner/repo-name"
}
```

**Response:**
```typescript
{
  branches: Array<{
    name: string;
    commit: {
      sha: string;
      url: string;
    };
    protected: boolean;
  }>;
}
```

**Example:**
```typescript
const response = await fetch('/git/github/branches', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${clerkJWT}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    pat: 'ghp_xxxxxxxxxxxxxxxxxxxx',
    repoFullName: 'vercel/next.js',
  }),
});

const { branches } = await response.json();
```

### 3. Create Project with GitHub Import

**Endpoint:** `POST /projects`

**Purpose:** Create a new project and optionally import from GitHub.

**Request:**
```typescript
{
  authorization: string;
  name: string;
  description?: string;
  template?: string;
  orgId?: string;

  // GitHub import fields (all required if importFromGitHub is true)
  importFromGitHub?: boolean;
  githubPat?: string;
  githubRepoFullName?: string;
  githubBranch?: string;
}
```

**Response:**
```typescript
{
  project: {
    id: bigint;
    name: string;
    // ... other project fields
    github_imported_from?: string;
    github_imported_branch?: string;
    github_import_date?: Date;
  };
}
```

**Example:**
```typescript
const response = await fetch('/projects', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${clerkJWT}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    name: 'My Imported Project',
    description: 'Imported from GitHub',
    importFromGitHub: true,
    githubPat: 'ghp_xxxxxxxxxxxxxxxxxxxx',
    githubRepoFullName: 'vercel/next.js',
    githubBranch: 'canary',
  }),
});

const { project } = await response.json();
```

## Frontend Implementation Guide

### Wizard Flow

The create project wizard should have the following flow:

#### Step 1: Project Creation Method
```
[ ] Start from scratch (existing flow)
[ ] Import from GitHub (new flow)
```

#### Step 2 (if Import from GitHub selected): GitHub PAT Input
```
┌─────────────────────────────────────────────────┐
│ GitHub Personal Access Token                    │
│                                                 │
│ ┌─────────────────────────────────────────────┐ │
│ │ ghp_xxxxxxxxxxxxxxxxxxxxx                   │ │
│ └─────────────────────────────────────────────┘ │
│                                                 │
│ Need help? [Create a token]                    │
└─────────────────────────────────────────────────┘

[Back]                                   [Continue]
```

**Token Requirements:**
- Scopes needed: `repo` (full repository access)
- Create token URL: https://github.com/settings/tokens/new
- Token should be validated by making a test API call before proceeding

#### Step 3 (if Import from GitHub selected): Repository Selection
```
┌─────────────────────────────────────────────────┐
│ Select Repository                               │
│                                                 │
│ 🔍 Search repositories...                      │
│                                                 │
│ ┌─────────────────────────────────────────────┐ │
│ │ ☐ vercel/next.js                            │ │
│ │   Next.js framework - 110k stars            │ │
│ │   Updated 2 hours ago                       │ │
│ ├─────────────────────────────────────────────┤ │
│ │ ☑ facebook/react                            │ │
│ │   React JavaScript library - 210k stars     │ │
│ │   Updated 5 hours ago                       │ │
│ ├─────────────────────────────────────────────┤ │
│ │ ☐ microsoft/vscode                          │ │
│ │   VS Code editor - 150k stars               │ │
│ │   Updated 1 day ago                         │ │
│ └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘

[Back]                                   [Continue]
```

**Features:**
- Load repositories on mount using `POST /git/github/repos`
- Show loading spinner while fetching
- Display repository metadata (stars, last updated, visibility)
- Filter/search functionality
- Handle pagination if needed (100 per page)

#### Step 4 (if Import from GitHub selected): Branch Selection
```
┌─────────────────────────────────────────────────┐
│ Select Branch                                   │
│                                                 │
│ Repository: facebook/react                     │
│                                                 │
│ ┌─────────────────────────────────────────────┐ │
│ │ ☑ main (default)                            │ │
│ │   Latest commit: feat: add new hook         │ │
│ │   SHA: a1b2c3d                              │ │
│ ├─────────────────────────────────────────────┤ │
│ │ ☐ canary                                    │ │
│ │   Latest commit: fix: resolve bug           │ │
│ │   SHA: e4f5g6h                              │ │
│ ├─────────────────────────────────────────────┤ │
│ │ ☐ experimental                              │ │
│ │   Latest commit: chore: update deps         │ │
│ │   SHA: i7j8k9l                              │ │
│ └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘

[Back]                                   [Continue]
```

**Features:**
- Load branches using `POST /git/github/branches`
- Show default branch indicator
- Display latest commit info
- Allow branch search/filter

#### Step 5 (if Import from GitHub selected): Project Details
```
┌─────────────────────────────────────────────────┐
│ Project Details                                 │
│                                                 │
│ Project Name *                                  │
│ ┌─────────────────────────────────────────────┐ │
│ │ React Library                               │ │
│ └─────────────────────────────────────────────┘ │
│                                                 │
│ Description (optional)                          │
│ ┌─────────────────────────────────────────────┐ │
│ │ Imported from facebook/react (main)         │ │
│ └─────────────────────────────────────────────┘ │
│                                                 │
│ Import Summary:                                 │
│ • Repository: facebook/react                   │
│ • Branch: main                                 │
│ • This will clone all files to your workspace  │
└─────────────────────────────────────────────────┘

[Back]                                [Create Project]
```

#### Step 6: Import Progress
```
┌─────────────────────────────────────────────────┐
│ Importing Repository...                         │
│                                                 │
│ [████████████████░░░░░░░░░░░░] 60%            │
│                                                 │
│ ✓ Creating project                             │
│ ✓ Cloning repository                           │
│ ⟳ Syncing files to workspace... (1,234 files)  │
│ ○ Initializing Git tracking                    │
│ ○ Setting up workspace environment             │
│                                                 │
│ This may take a few minutes for large repos... │
└─────────────────────────────────────────────────┘
```

### Example React Component Structure

```typescript
// Step 1: Import Method Selection
function ImportMethodStep() {
  const [method, setMethod] = useState<'scratch' | 'github'>('scratch');

  return (
    <div>
      <RadioGroup value={method} onChange={setMethod}>
        <Radio value="scratch">Start from scratch</Radio>
        <Radio value="github">Import from GitHub</Radio>
      </RadioGroup>
      <Button onClick={() => onNext(method)}>Continue</Button>
    </div>
  );
}

// Step 2: GitHub PAT Input
function GitHubPATStep() {
  const [pat, setPat] = useState('');
  const [validating, setValidating] = useState(false);

  const validatePAT = async () => {
    setValidating(true);
    try {
      const response = await fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${pat}` },
      });

      if (response.ok) {
        onNext(pat);
      } else {
        setError('Invalid token');
      }
    } catch (error) {
      setError('Failed to validate token');
    } finally {
      setValidating(false);
    }
  };

  return (
    <div>
      <Input
        type="password"
        value={pat}
        onChange={(e) => setPat(e.target.value)}
        placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
      />
      <Button onClick={validatePAT} disabled={validating}>
        {validating ? 'Validating...' : 'Continue'}
      </Button>
    </div>
  );
}

// Step 3: Repository Selection
function RepositorySelectionStep({ pat }: { pat: string }) {
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<GitHubRepo | null>(null);

  useEffect(() => {
    loadRepositories();
  }, []);

  const loadRepositories = async () => {
    try {
      const response = await fetch('/git/github/repos', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${clerkToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ pat }),
      });

      const data = await response.json();
      setRepos(data.repos);
    } catch (error) {
      console.error('Failed to load repos:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {loading ? (
        <Spinner />
      ) : (
        <RepoList
          repos={repos}
          selected={selected}
          onSelect={setSelected}
        />
      )}
      <Button
        onClick={() => onNext(selected)}
        disabled={!selected}
      >
        Continue
      </Button>
    </div>
  );
}

// Step 4: Branch Selection
function BranchSelectionStep({ pat, repo }: { pat: string; repo: GitHubRepo }) {
  const [branches, setBranches] = useState<GitHubBranch[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string>(repo.default_branch);

  useEffect(() => {
    loadBranches();
  }, []);

  const loadBranches = async () => {
    try {
      const response = await fetch('/git/github/branches', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${clerkToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pat,
          repoFullName: repo.full_name,
        }),
      });

      const data = await response.json();
      setBranches(data.branches);
    } catch (error) {
      console.error('Failed to load branches:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {loading ? (
        <Spinner />
      ) : (
        <BranchList
          branches={branches}
          selected={selected}
          onSelect={setSelected}
          defaultBranch={repo.default_branch}
        />
      )}
      <Button
        onClick={() => onNext(selected)}
        disabled={!selected}
      >
        Continue
      </Button>
    </div>
  );
}

// Step 5: Project Creation with Import
function CreateProjectStep({ pat, repo, branch }: Props) {
  const [name, setName] = useState(repo.name);
  const [description, setDescription] = useState(
    `Imported from ${repo.full_name} (${branch})`
  );
  const [creating, setCreating] = useState(false);

  const createProject = async () => {
    setCreating(true);
    try {
      const response = await fetch('/projects', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${clerkToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          description,
          importFromGitHub: true,
          githubPat: pat,
          githubRepoFullName: repo.full_name,
          githubBranch: branch,
        }),
      });

      const { project } = await response.json();

      // Navigate to project
      router.push(`/projects/${project.id}`);
    } catch (error) {
      console.error('Failed to create project:', error);
      setError('Failed to import repository');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      <Input
        label="Project Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <Textarea
        label="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />

      <ImportSummary
        repo={repo.full_name}
        branch={branch}
      />

      <Button
        onClick={createProject}
        disabled={creating || !name}
      >
        {creating ? 'Creating...' : 'Create Project'}
      </Button>
    </div>
  );
}
```

## Error Handling

### Common Errors

1. **Invalid GitHub PAT**
   - Status: 401
   - Message: "Invalid GitHub Personal Access Token"
   - Solution: User needs to create a new token with correct scopes

2. **Repository Not Found**
   - Status: 404
   - Message: "Repository not found"
   - Solution: Check repository name and user permissions

3. **Clone Failed**
   - Status: 500
   - Message: "Failed to clone repository"
   - Causes: Network issues, large repository, authentication failure
   - Solution: Retry or contact support

4. **Project Name Conflict**
   - Status: 400
   - Message: "A project named 'X' already exists"
   - Solution: User must choose a different project name

### Progress Tracking

For long-running imports, consider implementing:

1. **WebSocket Connection** for real-time progress updates
2. **Polling Endpoint** to check import status:
   ```typescript
   GET /projects/:projectId/import-status

   Response:
   {
     status: 'pending' | 'cloning' | 'syncing' | 'complete' | 'failed';
     progress: number; // 0-100
     currentStep: string;
     filesProcessed?: number;
     totalFiles?: number;
   }
   ```

## Database Schema

### New Fields in `projects` Table

```sql
-- Import tracking
github_imported_from TEXT       -- Source repository URL
github_imported_branch TEXT     -- Branch that was imported
github_import_date TIMESTAMP    -- When import occurred
```

### Example Query

```sql
-- Find all projects imported from GitHub
SELECT
  id,
  name,
  github_imported_from,
  github_imported_branch,
  github_import_date
FROM projects
WHERE github_imported_from IS NOT NULL
ORDER BY github_import_date DESC;
```

## Testing Checklist

- [ ] Import from public repository
- [ ] Import from private repository
- [ ] Import different branches (main, develop, feature branches)
- [ ] Import large repositories (>1000 files)
- [ ] Handle invalid PAT gracefully
- [ ] Handle network failures during import
- [ ] Handle repository not found errors
- [ ] Verify files appear in VFS correctly
- [ ] Verify Git history is preserved
- [ ] Verify workspace is created automatically
- [ ] Test with organization projects
- [ ] Test concurrent imports

## Security Considerations

1. **GitHub PAT Storage**
   - PATs are stored in the `projects` table
   - Consider encrypting PATs at rest (future enhancement)
   - PATs are never exposed in API responses (except during import flow)

2. **Rate Limiting**
   - GitHub API has rate limits (5000 requests/hour for authenticated users)
   - Consider caching repository lists
   - Show rate limit status to users

3. **Repository Size Limits**
   - Very large repositories may timeout
   - Consider implementing repository size checks before import
   - Enforce subscription-based storage quotas

## Future Enhancements

1. **OAuth App Integration**
   - Replace PAT with GitHub OAuth for better UX
   - Implement "Connect GitHub" flow

2. **Automatic Syncing**
   - Watch for new commits in linked GitHub repositories
   - Auto-pull changes on a schedule

3. **Two-way Sync**
   - Push local changes back to GitHub automatically
   - Conflict resolution UI

4. **Submodule Support**
   - Handle Git submodules during import
   - Recursively clone submodules

5. **Import History**
   - Track all commits from imported repository
   - Allow browsing full Git history in UI

6. **Selective Import**
   - Allow users to select specific folders/files to import
   - Useful for monorepos

## Support Resources

- GitHub PAT Creation: https://github.com/settings/tokens/new
- GitHub API Docs: https://docs.github.com/en/rest
- Required Scopes: `repo` (full repository access)
