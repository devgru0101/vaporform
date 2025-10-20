# GitHub Import API - Quick Reference

## Endpoints

### 1. List Repositories

```http
POST /git/github/repos
Authorization: Bearer {clerk_jwt}
Content-Type: application/json

{
  "pat": "ghp_xxxxxxxxxxxxxxxxxxxx"
}
```

**Response:**
```json
{
  "repos": [
    {
      "id": 123456,
      "name": "my-repo",
      "full_name": "username/my-repo",
      "private": false,
      "default_branch": "main",
      "html_url": "https://github.com/username/my-repo"
    }
  ]
}
```

### 2. List Branches

```http
POST /git/github/branches
Authorization: Bearer {clerk_jwt}
Content-Type: application/json

{
  "pat": "ghp_xxxxxxxxxxxxxxxxxxxx",
  "repoFullName": "username/my-repo"
}
```

**Response:**
```json
{
  "branches": [
    {
      "name": "main",
      "commit": {
        "sha": "a1b2c3d4e5f6...",
        "url": "https://api.github.com/repos/..."
      },
      "protected": false
    }
  ]
}
```

### 3. Create Project with Import

```http
POST /projects
Authorization: Bearer {clerk_jwt}
Content-Type: application/json

{
  "name": "My Imported Project",
  "description": "Imported from GitHub",
  "importFromGitHub": true,
  "githubPat": "ghp_xxxxxxxxxxxxxxxxxxxx",
  "githubRepoFullName": "username/my-repo",
  "githubBranch": "main"
}
```

**Response:**
```json
{
  "project": {
    "id": "123",
    "name": "My Imported Project",
    "github_imported_from": "https://github.com/username/my-repo.git",
    "github_imported_branch": "main",
    "github_import_date": "2025-01-15T10:30:00Z",
    "git_initialized": true,
    ...
  }
}
```

## TypeScript Types

```typescript
interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  default_branch: string;
  html_url: string;
}

interface GitHubBranch {
  name: string;
  commit: {
    sha: string;
    url: string;
  };
  protected: boolean;
}

interface CreateProjectRequest {
  authorization: string;
  name: string;
  description?: string;
  template?: string;
  orgId?: string;

  // GitHub import
  importFromGitHub?: boolean;
  githubPat?: string;
  githubRepoFullName?: string;
  githubBranch?: string;
}
```

## Example Usage (React)

```typescript
import { useState, useEffect } from 'react';

// 1. List repositories
async function listRepos(pat: string) {
  const response = await fetch('/git/github/repos', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${clerkToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ pat }),
  });

  const data = await response.json();
  return data.repos;
}

// 2. List branches
async function listBranches(pat: string, repoFullName: string) {
  const response = await fetch('/git/github/branches', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${clerkToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ pat, repoFullName }),
  });

  const data = await response.json();
  return data.branches;
}

// 3. Create project with import
async function createProjectWithImport(
  name: string,
  pat: string,
  repoFullName: string,
  branch: string
) {
  const response = await fetch('/projects', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${clerkToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
      description: `Imported from ${repoFullName} (${branch})`,
      importFromGitHub: true,
      githubPat: pat,
      githubRepoFullName: repoFullName,
      githubBranch: branch,
    }),
  });

  const data = await response.json();
  return data.project;
}

// Complete wizard component
function GitHubImportWizard() {
  const [step, setStep] = useState(1);
  const [pat, setPat] = useState('');
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null);
  const [branches, setBranches] = useState<GitHubBranch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState('');

  // Step 1: Validate PAT and load repos
  const handlePATSubmit = async () => {
    const repos = await listRepos(pat);
    setRepos(repos);
    setStep(2);
  };

  // Step 2: Select repository
  const handleRepoSelect = async (repo: GitHubRepo) => {
    setSelectedRepo(repo);
    const branches = await listBranches(pat, repo.full_name);
    setBranches(branches);
    setSelectedBranch(repo.default_branch);
    setStep(3);
  };

  // Step 3: Select branch
  const handleBranchSelect = (branch: string) => {
    setSelectedBranch(branch);
    setStep(4);
  };

  // Step 4: Create project
  const handleCreateProject = async (name: string) => {
    if (!selectedRepo) return;

    const project = await createProjectWithImport(
      name,
      pat,
      selectedRepo.full_name,
      selectedBranch
    );

    // Navigate to project
    router.push(`/projects/${project.id}`);
  };

  return (
    <div>
      {step === 1 && <PATInput onSubmit={handlePATSubmit} />}
      {step === 2 && <RepoSelector repos={repos} onSelect={handleRepoSelect} />}
      {step === 3 && <BranchSelector branches={branches} onSelect={handleBranchSelect} />}
      {step === 4 && <ProjectDetails onCreate={handleCreateProject} />}
    </div>
  );
}
```

## Error Codes

| Status | Error | Solution |
|--------|-------|----------|
| 400 | Invalid GitHub Personal Access Token | Create new token with `repo` scope |
| 404 | Repository not found | Check repository name and permissions |
| 400 | Project name already exists | Choose different project name |
| 500 | Failed to clone repository | Retry or contact support |

## GitHub PAT Requirements

**Required Scopes:**
- ✅ `repo` - Full control of private repositories

**Create Token:**
1. Go to https://github.com/settings/tokens/new
2. Select `repo` scope
3. Generate token
4. Copy token (shown only once)

## Common Issues

### "Invalid GitHub Personal Access Token"
- Token expired or revoked
- Token doesn't have `repo` scope
- Token was deleted from GitHub

### "Repository not found"
- Incorrect repository name format (should be `owner/repo`)
- User doesn't have access to private repository
- Repository was deleted

### Import takes too long
- Large repositories may take 5-10 minutes
- Consider showing progress indicator
- Backend logs show detailed progress

## Rate Limits

GitHub API limits:
- **Authenticated:** 5,000 requests/hour
- **Unauthenticated:** 60 requests/hour

The import workflow makes approximately 3-4 API calls:
1. Validate PAT (1 call)
2. List repos (1 call)
3. List branches (1 call)
4. Clone repository (1-2 calls internally)

## Testing

### Test Repositories

**Small repos (fast import):**
- `octocat/Hello-World` - 1 file
- `github/gitignore` - ~100 files

**Medium repos:**
- `facebook/react` - ~500 files
- `vercel/next.js` - ~1000 files

**Large repos (slower):**
- `microsoft/vscode` - ~10,000 files
- `tensorflow/tensorflow` - ~20,000 files

### Test PAT

Create a test PAT with limited scope:
1. Only `public_repo` for testing with public repos
2. Set expiration to 7 days
3. Use descriptive name: "Vaporform Import Test"

## Next Steps

1. ✅ Backend implementation complete
2. ⬜ Implement frontend wizard
3. ⬜ Add loading states and progress tracking
4. ⬜ Add error boundaries
5. ⬜ Add telemetry/analytics
6. ⬜ User testing
