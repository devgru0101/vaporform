/**
 * API Client for Vaporform Backend
 * Client-side compatible version
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:4000';

export class VaporformAPI {
  private tokenGetter?: () => Promise<string | null>;

  /**
   * Set the token getter function (should be called from useAuth hook)
   */
  setTokenGetter(getter: () => Promise<string | null>) {
    this.tokenGetter = getter;
  }

  private async getAuthHeaders() {
    let token: string | null = null;

    if (this.tokenGetter) {
      token = await this.tokenGetter();
    } else {
      console.error('[API] No tokenGetter set! Call setTokenGetter first.');
    }

    if (!token) {
      console.error('[API] Authentication token is missing. User may not be signed in or Clerk is not initialized.');
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    } else {
      console.warn('[API] No Authorization header - request will fail');
    }

    return headers;
  }

  // Projects
  async createProject(name: string, template?: string) {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${API_URL}/projects`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name, template }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  async listProjects() {
    const headers = await this.getAuthHeaders();
    console.log('[API] listProjects - fetching from:', `${API_URL}/projects`);
    console.log('[API] listProjects - headers:', headers);

    try {
      const response = await fetch(`${API_URL}/projects`, { headers });
      console.log('[API] listProjects - response status:', response.status);
      console.log('[API] listProjects - response ok:', response.ok);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[API] listProjects - error response:', errorText);
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('[API] listProjects - success, projects count:', data.projects?.length || 0);
      return data;
    } catch (error) {
      console.error('[API] listProjects - fetch failed:', error);
      throw error;
    }
  }

  async getProject(projectId: string) {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${API_URL}/projects/${projectId}`, { headers });
    return response.json();
  }

  async deleteProject(projectId: string) {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${API_URL}/projects/${projectId}`, {
      method: 'DELETE',
      headers,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  // VFS - Files
  async listDirectory(projectId: string, path: string = '/') {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${API_URL}/vfs/directories/${projectId}?path=${encodeURIComponent(path)}`, {
      headers,
    });
    return response.json();
  }

  async readFile(projectId: string, path: string) {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${API_URL}/vfs/files/${projectId}/${path}`, { headers });
    return response.json();
  }

  async writeFile(projectId: string, path: string, content: string, encoding: 'utf-8' | 'base64' = 'utf-8') {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${API_URL}/vfs/files`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ projectId, path, content, encoding }),
    });
    return response.json();
  }

  async createDirectory(projectId: string, path: string) {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${API_URL}/vfs/directories`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ projectId, path }),
    });
    return response.json();
  }

  async deleteFile(projectId: string, path: string, recursive: boolean = false) {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${API_URL}/vfs/files/${projectId}/${path}?recursive=${recursive}`, {
      method: 'DELETE',
      headers,
    });
    return response.json();
  }

  // Git
  async initGit(projectId: string) {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${API_URL}/git/init`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ projectId }),
    });
    return response.json();
  }

  async createCommit(projectId: string, message: string, files?: string[]) {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${API_URL}/git/commit`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ projectId, message, files }),
    });
    return response.json();
  }

  async getHistory(projectId: string, limit: number = 50) {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${API_URL}/git/history/${projectId}?limit=${limit}`, {
      headers,
    });
    return response.json();
  }

  async listBranches(projectId: string) {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${API_URL}/git/branches/${projectId}`, { headers });
    return response.json();
  }

  async createBranch(projectId: string, branchName: string, fromCommit?: string) {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${API_URL}/git/branch`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ projectId, branchName, fromCommit }),
    });
    return response.json();
  }

  async checkoutBranch(projectId: string, branchName: string) {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${API_URL}/git/checkout`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ projectId, branchName }),
    });
    return response.json();
  }

  // GitHub Integration
  async getGitHubConnection(projectId: string) {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${API_URL}/git/github/connection/${projectId}`, { headers });
    if (!response.ok && response.status === 404) {
      return { connected: false };
    }
    return response.json();
  }

  async connectGitHub(projectId: string, pat: string) {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${API_URL}/git/github/connect`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ projectId, pat }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  async listGitHubRepos(pat: string) {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${API_URL}/git/github/repos`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ pat }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  async createGitHubRepo(pat: string, name: string, isPrivate: boolean) {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${API_URL}/git/github/create-repo`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ pat, name, private: isPrivate }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  async pushToGitHub(projectId: string, pat: string, repoFullName: string, branch: string) {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${API_URL}/git/github/push`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ projectId, pat, repoFullName, branch }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  // Project Generation
  async generateProject(projectId: string, wizardData: any) {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${API_URL}/projects/${projectId}/generate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ wizardData }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  async getGenerationStatus(projectId: string) {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${API_URL}/projects/${projectId}/generation/status`, {
      headers,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  async getProjectGenerationLogs(projectId: string, limit?: number) {
    const headers = await this.getAuthHeaders();
    const url = `${API_URL}/projects/${projectId}/generation/logs${limit ? `?limit=${limit}` : ''}`;
    const response = await fetch(url, { headers });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  // AI Chat
  async createChatSession(projectId: string, title?: string) {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${API_URL}/ai/sessions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ projectId, title }),
    });
    return response.json();
  }

  async listChatSessions(projectId: string) {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${API_URL}/ai/projects/${projectId}/sessions`, { headers });
    return response.json();
  }

  async getChatMessages(sessionId: string) {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${API_URL}/ai/sessions/${sessionId}/messages`, { headers });
    return response.json();
  }

  async addChatMessage(sessionId: string, role: 'user' | 'assistant' | 'system', content: string, metadata?: Record<string, any>) {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${API_URL}/ai/sessions/${sessionId}/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ role, content, metadata }),
    });
    return response.json();
  }

  // Terminal
  async createTerminalSession(projectId: string, workspaceId?: string) {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${API_URL}/terminal/sessions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ projectId, workspaceId }),
    });
    return response.json();
  }

  // Terminal Agent
  async sendTerminalAgentMessage(params: {
    projectId: string;
    message: string;
    sessionId?: string;
    workspaceId?: string;
  }) {
    const headers = await this.getAuthHeaders();

    // Extract token from headers for body
    const token = headers['Authorization']?.replace('Bearer ', '') || '';

    const response = await fetch(`${API_URL}/ai/terminal-agent/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...params,
        authorization: `Bearer ${token}`, // Backend expects it in body
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  // Workspace
  async getProjectWorkspace(projectId: string) {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${API_URL}/workspace/project/${projectId}`, { headers });

    if (!response.ok) {
      if (response.status === 404) {
        return null; // No workspace found
      }
      const error = await response.json();
      throw new Error(error.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  async createWorkspace(projectId: string, name: string) {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${API_URL}/workspace/create`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ projectId, name }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  async forceRebuildWorkspace(projectId: string) {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${API_URL}/workspace/rebuild/${projectId}`, {
      method: 'POST',
      headers,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  async getTerminalUrl(workspaceId: string) {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${API_URL}/workspace/${workspaceId}/terminal-url`, {
      headers,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  async getSandboxUrl(workspaceId: string) {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${API_URL}/workspace/${workspaceId}/url`, {
      headers,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  // Deployment
  async createDeployment(projectId: string) {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${API_URL}/deploy/create`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ projectId }),
    });
    return response.json();
  }

  async getProjectDeployment(projectId: string) {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${API_URL}/deploy/project/${projectId}`, { headers });
    return response.json();
  }

  // Billing
  async getQuotaStatus() {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${API_URL}/billing/quota`, { headers });
    return response.json();
  }

  // User Settings
  async getUserSettings() {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${API_URL}/users/settings`, { headers });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  async updateUserSettings(settings: any) {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${API_URL}/users/settings`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ settings }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  async resetUserSettings() {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${API_URL}/users/settings/reset`, {
      method: 'POST',
      headers,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }
}

export const api = new VaporformAPI();
