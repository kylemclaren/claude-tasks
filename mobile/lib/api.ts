import * as SecureStore from 'expo-secure-store';
import type {
  Task,
  TaskRequest,
  TaskListResponse,
  TaskRun,
  TaskRunsResponse,
  Settings,
  Usage,
  SuccessResponse,
  HealthResponse,
} from './types';

const API_BASE_KEY = 'claude_tasks_api_base';
const AUTH_TOKEN_KEY = 'claude_tasks_auth_token';

export async function getApiBase(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(API_BASE_KEY);
  } catch {
    return null;
  }
}

export async function setApiBase(url: string): Promise<void> {
  await SecureStore.setItemAsync(API_BASE_KEY, url);
  apiClient.baseUrl = url;
}

export async function getAuthToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setAuthToken(token: string): Promise<void> {
  if (token) {
    await SecureStore.setItemAsync(AUTH_TOKEN_KEY, token);
  } else {
    await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY);
  }
  apiClient.authToken = token || null;
}

export async function isApiConfigured(): Promise<boolean> {
  const url = await getApiBase();
  return url !== null && url.length > 0;
}

class ApiClient {
  baseUrl: string = '';
  authToken: string | null = null;
  private initialized: boolean = false;

  async init(): Promise<void> {
    if (!this.initialized) {
      this.baseUrl = await getApiBase() || '';
      this.authToken = await getAuthToken();
      this.initialized = true;
    }
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    if (!this.baseUrl) {
      await this.init();
    }

    if (!this.baseUrl) {
      throw new Error('API URL not configured');
    }

    const url = `${this.baseUrl}/api/v1${endpoint}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        ...headers,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // Health
  async healthCheck(): Promise<HealthResponse> {
    return this.request('/health');
  }

  // Tasks
  async listTasks(): Promise<TaskListResponse> {
    return this.request('/tasks');
  }

  async getTask(id: number): Promise<Task> {
    return this.request(`/tasks/${id}`);
  }

  async createTask(task: TaskRequest): Promise<Task> {
    return this.request('/tasks', {
      method: 'POST',
      body: JSON.stringify(task),
    });
  }

  async updateTask(id: number, task: TaskRequest): Promise<Task> {
    return this.request(`/tasks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(task),
    });
  }

  async deleteTask(id: number): Promise<SuccessResponse> {
    return this.request(`/tasks/${id}`, { method: 'DELETE' });
  }

  async toggleTask(id: number): Promise<Task> {
    return this.request(`/tasks/${id}/toggle`, { method: 'POST' });
  }

  async runTask(id: number): Promise<SuccessResponse> {
    return this.request(`/tasks/${id}/run`, { method: 'POST' });
  }

  async getTaskRuns(id: number, limit = 20): Promise<TaskRunsResponse> {
    return this.request(`/tasks/${id}/runs?limit=${limit}`);
  }

  async getLatestTaskRun(id: number): Promise<TaskRun> {
    return this.request(`/tasks/${id}/runs/latest`);
  }

  // Settings
  async getSettings(): Promise<Settings> {
    return this.request('/settings');
  }

  async updateSettings(settings: Settings): Promise<Settings> {
    return this.request('/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  }

  // Usage
  async getUsage(): Promise<Usage> {
    return this.request('/usage');
  }
}

export const apiClient = new ApiClient();
