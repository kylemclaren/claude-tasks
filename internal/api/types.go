package api

import "time"

// TaskRequest represents a task creation/update request
type TaskRequest struct {
	Name           string `json:"name"`
	Prompt         string `json:"prompt"`
	CronExpr       string `json:"cron_expr"`
	WorkingDir     string `json:"working_dir"`
	DiscordWebhook string `json:"discord_webhook,omitempty"`
	SlackWebhook   string `json:"slack_webhook,omitempty"`
	Enabled        bool   `json:"enabled"`
}

// TaskResponse represents a task in API responses
type TaskResponse struct {
	ID             int64      `json:"id"`
	Name           string     `json:"name"`
	Prompt         string     `json:"prompt"`
	CronExpr       string     `json:"cron_expr"`
	WorkingDir     string     `json:"working_dir"`
	DiscordWebhook string     `json:"discord_webhook,omitempty"`
	SlackWebhook   string     `json:"slack_webhook,omitempty"`
	Enabled        bool       `json:"enabled"`
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`
	LastRunAt      *time.Time `json:"last_run_at,omitempty"`
	NextRunAt      *time.Time `json:"next_run_at,omitempty"`
	LastRunStatus  string     `json:"last_run_status,omitempty"`
}

// TaskListResponse represents a list of tasks
type TaskListResponse struct {
	Tasks []TaskResponse `json:"tasks"`
	Total int            `json:"total"`
}

// TaskRunResponse represents a task run in API responses
type TaskRunResponse struct {
	ID         int64      `json:"id"`
	TaskID     int64      `json:"task_id"`
	StartedAt  time.Time  `json:"started_at"`
	EndedAt    *time.Time `json:"ended_at,omitempty"`
	Status     string     `json:"status"`
	Output     string     `json:"output"`
	Error      string     `json:"error,omitempty"`
	DurationMs *int64     `json:"duration_ms,omitempty"`
}

// TaskRunsResponse represents a list of task runs
type TaskRunsResponse struct {
	Runs  []TaskRunResponse `json:"runs"`
	Total int               `json:"total"`
}

// SettingsResponse represents the settings
type SettingsResponse struct {
	UsageThreshold float64 `json:"usage_threshold"`
}

// SettingsRequest represents a settings update request
type SettingsRequest struct {
	UsageThreshold float64 `json:"usage_threshold"`
}

// UsageBucketResponse represents a usage bucket
type UsageBucketResponse struct {
	Utilization float64 `json:"utilization"`
	ResetsAt    string  `json:"resets_at"`
}

// UsageResponse represents API usage data
type UsageResponse struct {
	FiveHour UsageBucketResponse `json:"five_hour"`
	SevenDay UsageBucketResponse `json:"seven_day"`
}

// ErrorResponse represents an error response
type ErrorResponse struct {
	Error   string `json:"error"`
	Code    string `json:"code,omitempty"`
	Details string `json:"details,omitempty"`
}

// SuccessResponse represents a generic success response
type SuccessResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message,omitempty"`
}

// HealthResponse represents the health check response
type HealthResponse struct {
	Status  string `json:"status"`
	Version string `json:"version,omitempty"`
}
