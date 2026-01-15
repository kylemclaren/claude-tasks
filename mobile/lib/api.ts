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
const DEFAULT_API_BASE = 'https://clawdbot-dvft.sprites.app';

export async function getApiBase(): Promise<string> {
  try {
    const stored = await SecureStore.getItemAsync(API_BASE_KEY);
    return stored || DEFAULT_API_BASE;
  } catch {
    return DEFAULT_API_BASE;
  }
}

export async function setApiBase(url: string): Promise<void> {
  await SecureStore.setItemAsync(API_BASE_KEY, url);
  apiClient.baseUrl = url;
}

class ApiClient {
  baseUrl: string = '';
  private initialized: boolean = false;

  async init(): Promise<void> {
    if (!this.initialized) {
      this.baseUrl = await getApiBase();
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

    const url = `${this.baseUrl}/api/v1${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
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
