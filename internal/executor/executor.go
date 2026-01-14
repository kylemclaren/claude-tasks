package executor

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"
	"time"

	"github.com/kylemclaren/claude-tasks/internal/db"
	"github.com/kylemclaren/claude-tasks/internal/usage"
	"github.com/kylemclaren/claude-tasks/internal/webhook"
)

// Executor runs Claude CLI tasks
type Executor struct {
	db          *db.DB
	discord     *webhook.Discord
	usageClient *usage.Client
}

// New creates a new executor
func New(database *db.DB) *Executor {
	usageClient, _ := usage.NewClient() // Ignore error, will be nil if credentials not found

	return &Executor{
		db:          database,
		discord:     webhook.NewDiscord(),
		usageClient: usageClient,
	}
}

// Result represents the result of a task execution
type Result struct {
	Output    string
	Error     error
	Duration  time.Duration
	Skipped   bool
	SkipReason string
}

// Execute runs a Claude CLI command for the given task
func (e *Executor) Execute(ctx context.Context, task *db.Task) *Result {
	startTime := time.Now()

	// Check usage threshold before running
	if e.usageClient != nil {
		threshold, _ := e.db.GetUsageThreshold()
		ok, usageData, err := e.usageClient.CheckThreshold(threshold)
		if err == nil && !ok {
			// Usage is above threshold, skip the task
			skipReason := fmt.Sprintf("Usage above threshold (%.0f%%): 5h=%.0f%%, 7d=%.0f%%. Resets in %s",
				threshold,
				usageData.FiveHour.Utilization,
				usageData.SevenDay.Utilization,
				usageData.FormatTimeUntilReset())

			// Create a skipped run record
			run := &db.TaskRun{
				TaskID:    task.ID,
				StartedAt: startTime,
				Status:    db.RunStatusFailed,
				Error:     skipReason,
			}
			endTime := time.Now()
			run.EndedAt = &endTime
			_ = e.db.CreateTaskRun(run)

			return &Result{
				Skipped:    true,
				SkipReason: skipReason,
				Duration:   time.Since(startTime),
			}
		}
	}

	// Create task run record
	run := &db.TaskRun{
		TaskID:    task.ID,
		StartedAt: startTime,
		Status:    db.RunStatusRunning,
	}
	if err := e.db.CreateTaskRun(run); err != nil {
		return &Result{Error: fmt.Errorf("failed to create run record: %w", err)}
	}

	// Build and execute command
	// -p enables print mode (non-interactive), prompt is positional arg
	// --dangerously-skip-permissions bypasses permission prompts for scheduled tasks
	cmd := exec.CommandContext(ctx, "claude", "-p", "--dangerously-skip-permissions", task.Prompt)
	cmd.Dir = task.WorkingDir

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()
	endTime := time.Now()
	duration := endTime.Sub(startTime)

	// Update run record
	run.EndedAt = &endTime
	run.Output = stdout.String()
	if err != nil {
		run.Status = db.RunStatusFailed
		run.Error = fmt.Sprintf("%s\n%s", err.Error(), stderr.String())
	} else {
		run.Status = db.RunStatusCompleted
	}
	_ = e.db.UpdateTaskRun(run)

	// Update task's last run time
	task.LastRunAt = &endTime
	_ = e.db.UpdateTask(task)

	// Send Discord notification if configured
	if task.DiscordWebhook != "" {
		_ = e.discord.SendResult(task.DiscordWebhook, task, run)
	}

	result := &Result{
		Output:   stdout.String(),
		Duration: duration,
	}
	if err != nil {
		result.Error = fmt.Errorf("%s: %s", err.Error(), stderr.String())
	}

	return result
}

// ExecuteAsync runs a task asynchronously
func (e *Executor) ExecuteAsync(task *db.Task) <-chan *Result {
	ch := make(chan *Result, 1)
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
		defer cancel()
		ch <- e.Execute(ctx, task)
		close(ch)
	}()
	return ch
}
