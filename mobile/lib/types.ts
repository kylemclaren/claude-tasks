export interface Task {
  id: number;
  name: string;
  prompt: string;
  cron_expr: string;
  working_dir: string;
  discord_webhook?: string;
  slack_webhook?: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
  last_run_at?: string;
  next_run_at?: string;
  last_run_status?: 'pending' | 'running' | 'completed' | 'failed';
}

export interface TaskRequest {
  name: string;
  prompt: string;
  cron_expr: string;
  working_dir: string;
  discord_webhook?: string;
  slack_webhook?: string;
  enabled: boolean;
}

export interface TaskListResponse {
  tasks: Task[];
  total: number;
}

export interface TaskRun {
  id: number;
  task_id: number;
  started_at: string;
  ended_at?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  output: string;
  error?: string;
  duration_ms?: number;
}

export interface TaskRunsResponse {
  runs: TaskRun[];
  total: number;
}

export interface Settings {
  usage_threshold: number;
}

export interface Usage {
  five_hour: {
    utilization: number;
    resets_at: string;
  };
  seven_day: {
    utilization: number;
    resets_at: string;
  };
}

export interface SuccessResponse {
  success: boolean;
  message?: string;
}

export interface HealthResponse {
  status: string;
  version?: string;
}
