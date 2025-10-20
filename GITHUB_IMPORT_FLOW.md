# GitHub Import User Flow Diagram

## Visual Flow

```
┌─────────────────────────────────────────────────────────────┐
│                  Dashboard - Create Project                 │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │                                                         │ │
│  │   [+] Create New Project                               │ │
│  │                                                         │ │
│  └───────────────────────────────────────────────────────┘ │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│             Step 1: Choose Import Method                    │
│                                                             │
│  ○ Start from scratch                                      │
│     Generate code with AI                                  │
│                                                             │
│  ● Import from GitHub                                      │
│     Import existing repository                             │
│                                                             │
│                                    [Back]      [Continue →] │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│         Step 2: GitHub Personal Access Token                │
│                                                             │
│  Enter your GitHub PAT to access repositories:             │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ghp_xxxxxxxxxxxxxxxxxxxx                 [👁]       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ⓘ Need a token? [Create one on GitHub]                   │
│     Required scope: repo                                   │
│                                                             │
│                                    [Back]      [Continue →] │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼ (API: POST /git/github/repos)
┌─────────────────────────────────────────────────────────────┐
│            Step 3: Select Repository                        │
│                                                             │
│  🔍 Search repositories...                                 │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ☐ facebook/react                      🔒 Private    │   │
│  │   A JavaScript library for building UIs             │   │
│  │   ⭐ 210k  🔀 45k  Updated 2 hours ago              │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │ ☑ vercel/next.js                      🌐 Public     │   │
│  │   The React Framework                               │   │
│  │   ⭐ 110k  🔀 25k  Updated 5 hours ago              │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │ ☐ microsoft/vscode                    🌐 Public     │   │
│  │   Visual Studio Code                                │   │
│  │   ⭐ 150k  🔀 28k  Updated 1 day ago                │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Showing 3 of 42 repositories                              │
│                                                             │
│                                    [Back]      [Continue →] │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼ (API: POST /git/github/branches)
┌─────────────────────────────────────────────────────────────┐
│              Step 4: Select Branch                          │
│                                                             │
│  Repository: vercel/next.js                                │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ☑ canary (default) 🌟                               │   │
│  │   feat: add parallel routes                         │   │
│  │   a1b2c3d • 2 hours ago • John Doe                  │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │ ☐ main                                              │   │
│  │   docs: update readme                               │   │
│  │   e4f5g6h • 1 day ago • Jane Smith                  │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │ ☐ v13-experimental                                  │   │
│  │   chore: bump dependencies                          │   │
│  │   i7j8k9l • 3 days ago • Bob Wilson                 │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Showing 3 of 15 branches                                  │
│                                                             │
│                                    [Back]      [Continue →] │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│           Step 5: Project Details                           │
│                                                             │
│  Project Name *                                            │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Next.js Framework                                   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Description                                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Imported from vercel/next.js (canary branch)        │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓   │
│  ┃ Import Summary                                      ┃   │
│  ┃                                                     ┃   │
│  ┃ • Repository: vercel/next.js                       ┃   │
│  ┃ • Branch: canary                                   ┃   │
│  ┃ • Visibility: Public                               ┃   │
│  ┃ • Estimated files: ~1,200                          ┃   │
│  ┃                                                     ┃   │
│  ┃ ⚠️ This will clone all repository files to your    ┃   │
│  ┃    Vaporform workspace. Large repositories may     ┃   │
│  ┃    take several minutes to import.                 ┃   │
│  ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛   │
│                                                             │
│                                    [Back]   [Create Project]│
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼ (API: POST /projects)
┌─────────────────────────────────────────────────────────────┐
│              Step 6: Importing Repository                   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                                                       │   │
│  │  Importing vercel/next.js...                         │   │
│  │                                                       │   │
│  │  [██████████████████████████░░░░░░░░░░] 65%         │   │
│  │                                                       │   │
│  │  ✓ Creating project                                  │   │
│  │  ✓ Setting up workspace                              │   │
│  │  ✓ Cloning repository from GitHub                    │   │
│  │  ⟳ Syncing files (784 of 1,203 files)...            │   │
│  │  ○ Initializing Git tracking                         │   │
│  │  ○ Finalizing import                                 │   │
│  │                                                       │   │
│  │  This may take a few minutes...                      │   │
│  │                                                       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ⓘ You can safely leave this page. We'll notify you      │
│     when the import is complete.                          │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼ (Import Complete)
┌─────────────────────────────────────────────────────────────┐
│                Import Successful! 🎉                        │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                                                       │   │
│  │  ✓ Repository imported successfully!                 │   │
│  │                                                       │   │
│  │  • 1,203 files synced                                │   │
│  │  • 15 MB total size                                  │   │
│  │  • Git history preserved                             │   │
│  │  • Workspace ready                                   │   │
│  │                                                       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Your project "Next.js Framework" is ready to use!        │
│                                                             │
│                                           [Open Project →]  │
└─────────────────────────────────────────────────────────────┘
```

## Error States

### PAT Validation Failed
```
┌─────────────────────────────────────────────────────────────┐
│         Step 2: GitHub Personal Access Token                │
│                                                             │
│  Enter your GitHub PAT to access repositories:             │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ghp_invalid_token                        [👁]       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ❌ Invalid token. Please check your GitHub PAT and       │
│     ensure it has the 'repo' scope.                        │
│                                                             │
│  ⓘ Need a token? [Create one on GitHub]                   │
│     Required scope: repo                                   │
│                                                             │
│                                    [Back]      [Try Again]  │
└─────────────────────────────────────────────────────────────┘
```

### Repository Not Found
```
┌─────────────────────────────────────────────────────────────┐
│              Step 4: Select Branch                          │
│                                                             │
│  ❌ Repository not found or you don't have access.         │
│                                                             │
│  This could happen if:                                     │
│  • The repository was deleted                              │
│  • Your token doesn't have access to private repos         │
│  • The repository name is incorrect                        │
│                                                             │
│                                    [Back]      [Try Again]  │
└─────────────────────────────────────────────────────────────┘
```

### Import Failed
```
┌─────────────────────────────────────────────────────────────┐
│              Import Failed                                  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                                                       │   │
│  │  ❌ Failed to import repository                      │   │
│  │                                                       │   │
│  │  Error: Unable to clone repository                   │   │
│  │                                                       │   │
│  │  Possible causes:                                    │   │
│  │  • Network connectivity issues                       │   │
│  │  • Repository is too large                           │   │
│  │  • GitHub API rate limit exceeded                    │   │
│  │                                                       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Your project was created but the import failed.           │
│  You can try importing again or start from scratch.        │
│                                                             │
│                           [Try Again]  [Start from Scratch] │
└─────────────────────────────────────────────────────────────┘
```

## Mobile Responsive Flow

On mobile devices, simplify the UI:

```
┌─────────────────────────┐
│   Step 1: Method        │
│                         │
│ ○ From Scratch         │
│ ● Import GitHub        │
│                         │
│         [Next]          │
└─────────────────────────┘

┌─────────────────────────┐
│   Step 2: GitHub PAT    │
│                         │
│ ┌─────────────────────┐ │
│ │ ghp_xxx...          │ │
│ └─────────────────────┘ │
│                         │
│ [Create Token]          │
│         [Next]          │
└─────────────────────────┘

┌─────────────────────────┐
│   Step 3: Repository    │
│                         │
│ 🔍 Search...           │
│                         │
│ ☑ vercel/next.js       │
│   Updated 5h ago        │
│                         │
│ ☐ facebook/react       │
│   Updated 2h ago        │
│                         │
│         [Next]          │
└─────────────────────────┘

┌─────────────────────────┐
│   Step 4: Branch        │
│                         │
│ ☑ canary (default)     │
│   a1b2c3d              │
│                         │
│ ☐ main                 │
│   e4f5g6h              │
│                         │
│         [Next]          │
└─────────────────────────┘

┌─────────────────────────┐
│   Step 5: Details       │
│                         │
│ Name:                   │
│ ┌─────────────────────┐ │
│ │ Next.js Framework   │ │
│ └─────────────────────┘ │
│                         │
│ Description:            │
│ ┌─────────────────────┐ │
│ │ Imported from...    │ │
│ └─────────────────────┘ │
│                         │
│      [Create]           │
└─────────────────────────┘
```

## Component Hierarchy

```
CreateProjectWizard
├── ImportMethodStep
│   ├── RadioButton (From Scratch)
│   └── RadioButton (Import GitHub)
│
├── GitHubPATStep
│   ├── Input (PAT)
│   ├── Button (Validate)
│   ├── Link (Create Token)
│   └── ErrorMessage
│
├── RepositorySelectStep
│   ├── SearchInput
│   ├── RepositoryList
│   │   ├── RepositoryCard
│   │   │   ├── RepoName
│   │   │   ├── RepoDescription
│   │   │   ├── RepoStats (stars, forks)
│   │   │   └── PrivacyBadge
│   │   └── ... (more cards)
│   └── Pagination
│
├── BranchSelectStep
│   ├── SearchInput
│   ├── BranchList
│   │   ├── BranchCard
│   │   │   ├── BranchName
│   │   │   ├── DefaultBadge
│   │   │   ├── CommitInfo
│   │   │   └── ProtectedBadge
│   │   └── ... (more cards)
│   └── ErrorBoundary
│
├── ProjectDetailsStep
│   ├── Input (Project Name)
│   ├── Textarea (Description)
│   ├── ImportSummaryCard
│   │   ├── RepoInfo
│   │   ├── BranchInfo
│   │   └── WarningMessage
│   └── CreateButton
│
└── ImportProgressStep
    ├── ProgressBar
    ├── StepIndicator
    │   ├── CheckIcon (Complete)
    │   ├── SpinnerIcon (In Progress)
    │   └── CircleIcon (Pending)
    ├── StatusMessage
    └── CancelButton (optional)
```

## State Machine

```typescript
type WizardStep =
  | 'method'
  | 'pat'
  | 'repository'
  | 'branch'
  | 'details'
  | 'importing'
  | 'success'
  | 'error';

type WizardState = {
  step: WizardStep;
  data: {
    method?: 'scratch' | 'github';
    pat?: string;
    selectedRepo?: GitHubRepo;
    selectedBranch?: string;
    projectName?: string;
    projectDescription?: string;
  };
  loading: boolean;
  error?: string;
};

// State transitions
method → pat → repository → branch → details → importing → success
   ↓                                                           ↓
   └─────────────────────────────────────────────────────→ error
```

## Accessibility

- ✅ Keyboard navigation between steps
- ✅ ARIA labels on all interactive elements
- ✅ Screen reader announcements for step changes
- ✅ Focus management when navigating steps
- ✅ Error messages announced to screen readers
- ✅ Loading states communicated clearly
- ✅ High contrast mode support

## Animation Suggestions

- Step transitions: Slide left/right (300ms ease-in-out)
- Progress bar: Smooth fill animation
- Loading spinner: Rotate animation
- Success checkmarks: Scale + fade in
- Error shake: Subtle horizontal shake
- Button hover: Scale 1.05
- Card selection: Border highlight + scale

## Copy/Messaging

### Step Headers
- "Choose how to start" (Step 1)
- "Connect your GitHub account" (Step 2)
- "Select a repository to import" (Step 3)
- "Choose a branch" (Step 4)
- "Name your project" (Step 5)

### Help Text
- "Your token is encrypted and stored securely"
- "We'll never modify your repositories"
- "Import may take a few minutes for large repos"
- "You can continue using Vaporform while we import"

### Success Messages
- "Repository imported successfully!"
- "All files synced and ready to use"
- "Your workspace is ready"

### Error Messages
- "Oops! Something went wrong"
- "We couldn't connect to GitHub"
- "This repository is too large to import"
