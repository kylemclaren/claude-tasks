package db

import "time"

// Task represents a scheduled Claude task
type Task struct {
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
}

// TaskRun represents an execution of a task
type TaskRun struct {
	ID        int64      `json:"id"`
	TaskID    int64      `json:"task_id"`
	StartedAt time.Time  `json:"started_at"`
	EndedAt   *time.Time `json:"ended_at,omitempty"`
	Status    RunStatus  `json:"status"`
	Output    string     `json:"output"`
	Error     string     `json:"error,omitempty"`
}

// RunStatus represents the status of a task run
type RunStatus string

const (
	RunStatusPending   RunStatus = "pending"
	RunStatusRunning   RunStatus = "running"
	RunStatusCompleted RunStatus = "completed"
	RunStatusFailed    RunStatus = "failed"
)
