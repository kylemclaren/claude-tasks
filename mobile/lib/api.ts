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
  StreamingRunResponse,
  SSEOutputChunk,
  SSECompletionEvent,
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

  // Streaming methods

  // Get a specific task run by ID
  async getTaskRun(taskId: number, runId: number): Promise<TaskRun> {
    return this.request(`/tasks/${taskId}/runs/${runId}`);
  }

  // Start a task with streaming and return the run ID immediately
  async runTaskStreaming(taskId: number): Promise<StreamingRunResponse> {
    return this.request(`/tasks/${taskId}/run/streaming`, { method: 'POST' });
  }

  // Get the SSE stream URL for a task run
  getStreamUrl(taskId: number, runId: number): string {
    return `${this.baseUrl}/api/v1/tasks/${taskId}/runs/${runId}/stream`;
  }

  // Subscribe to streaming output for a task run
  // Returns an EventSource-like interface for SSE events
  subscribeToRunStream(
    taskId: number,
    runId: number,
    callbacks: {
      onOutput: (chunk: SSEOutputChunk) => void;
      onComplete: (event: SSECompletionEvent) => void;
      onError: (error: Error) => void;
    }
  ): { close: () => void } {
    const url = this.getStreamUrl(taskId, runId);

    // Use EventSource for SSE
    // Note: React Native doesn't have native EventSource,
    // we'll use fetch with streaming instead
    const controller = new AbortController();

    const connect = async () => {
      try {
        const headers: Record<string, string> = {
          Accept: 'text/event-stream',
        };
        if (this.authToken) {
          headers['Authorization'] = `Bearer ${this.authToken}`;
        }

        const response = await fetch(url, {
          headers,
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('No response body');
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          let currentEvent = '';
          let currentData = '';

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              currentData = line.slice(6);
            } else if (line === '' && currentEvent && currentData) {
              // End of event, process it
              try {
                const data = JSON.parse(currentData);
                if (currentEvent === 'output') {
                  callbacks.onOutput(data as SSEOutputChunk);
                } else if (currentEvent === 'complete') {
                  callbacks.onComplete(data as SSECompletionEvent);
                }
              } catch (e) {
                console.warn('Failed to parse SSE data:', e);
              }
              currentEvent = '';
              currentData = '';
            }
          }
        }
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          callbacks.onError(error as Error);
        }
      }
    };

    connect();

    return {
      close: () => controller.abort(),
    };
  }
}

export const apiClient = new ApiClient();
