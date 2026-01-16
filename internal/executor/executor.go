package executor

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"strings"
	"time"

	"github.com/kylemclaren/claude-tasks/internal/db"
	"github.com/kylemclaren/claude-tasks/internal/stream"
	"github.com/kylemclaren/claude-tasks/internal/usage"
	"github.com/kylemclaren/claude-tasks/internal/webhook"
)

// Executor runs Claude CLI tasks
type Executor struct {
	db          *db.DB
	discord     *webhook.Discord
	slack       *webhook.Slack
	usageClient *usage.Client
	streamMgr   *stream.Manager
}

// New creates a new executor
func New(database *db.DB) *Executor {
	usageClient, _ := usage.NewClient() // Ignore error, will be nil if credentials not found

	return &Executor{
		db:          database,
		discord:     webhook.NewDiscord(),
		slack:       webhook.NewSlack(),
		usageClient: usageClient,
	}
}

// NewWithStreamManager creates a new executor with stream manager for real-time output
func NewWithStreamManager(database *db.DB, streamMgr *stream.Manager) *Executor {
	usageClient, _ := usage.NewClient()

	return &Executor{
		db:          database,
		discord:     webhook.NewDiscord(),
		slack:       webhook.NewSlack(),
		usageClient: usageClient,
		streamMgr:   streamMgr,
	}
}

// SetStreamManager sets the stream manager for real-time output
func (e *Executor) SetStreamManager(mgr *stream.Manager) {
	e.streamMgr = mgr
}

// Result represents the result of a task execution
type Result struct {
	Output     string
	Error      error
	Duration   time.Duration
	Skipped    bool
	SkipReason string
	RunID      int64 // ID of the created TaskRun record
}

// streamEvent represents a Claude CLI stream-json event
type streamEvent struct {
	Type  string `json:"type"`
	Event struct {
		Type  string `json:"type"`
		Index int    `json:"index"`
		Delta struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"delta,omitempty"`
	} `json:"event,omitempty"`
	Result struct {
		IsError bool   `json:"is_error,omitempty"`
		Error   string `json:"error,omitempty"`
	} `json:"result,omitempty"`
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

	// Use streaming if stream manager is available
	if e.streamMgr != nil {
		return e.executeStreaming(ctx, task, run, startTime)
	}

	return e.executeNonStreaming(ctx, task, run, startTime)
}

// ExecuteWithRun runs a Claude CLI command for the given task using an existing run record
// This is used by the streaming API endpoint which creates the run record upfront
func (e *Executor) ExecuteWithRun(ctx context.Context, task *db.Task, run *db.TaskRun) *Result {
	startTime := run.StartedAt

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

			// Update run as skipped/failed
			endTime := time.Now()
			run.EndedAt = &endTime
			run.Status = db.RunStatusFailed
			run.Error = skipReason
			_ = e.db.UpdateTaskRun(run)

			if e.streamMgr != nil {
				e.streamMgr.Complete(run.ID, "failed", skipReason)
			}

			return &Result{
				Skipped:    true,
				SkipReason: skipReason,
				Duration:   time.Since(startTime),
				RunID:      run.ID,
			}
		}
	}

	// Use streaming if stream manager is available
	if e.streamMgr != nil {
		return e.executeStreaming(ctx, task, run, startTime)
	}

	return e.executeNonStreaming(ctx, task, run, startTime)
}

// executeStreaming runs the task with real-time output streaming
func (e *Executor) executeStreaming(ctx context.Context, task *db.Task, run *db.TaskRun, startTime time.Time) *Result {
	// Build streaming command
	// --output-format stream-json outputs JSON lines with streaming content
	cmd := exec.CommandContext(ctx, "claude", "-p",
		"--dangerously-skip-permissions",
		"--output-format", "stream-json",
		task.Prompt)
	cmd.Dir = task.WorkingDir

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return e.handleExecutionError(run, task, startTime, fmt.Errorf("failed to create stdout pipe: %w", err))
	}

	stderr, err := cmd.StderrPipe()
	if err != nil {
		return e.handleExecutionError(run, task, startTime, fmt.Errorf("failed to create stderr pipe: %w", err))
	}

	if err := cmd.Start(); err != nil {
		return e.handleExecutionError(run, task, startTime, fmt.Errorf("failed to start command: %w", err))
	}

	// Collect stderr in background
	var stderrOutput strings.Builder
	go func() {
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {
			stderrOutput.WriteString(scanner.Text())
			stderrOutput.WriteString("\n")
		}
	}()

	// Process streaming output
	var outputBuilder strings.Builder
	scanner := bufio.NewScanner(stdout)
	// Increase buffer size for large JSON lines
	buf := make([]byte, 0, 64*1024)
	scanner.Buffer(buf, 1024*1024)

	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			continue
		}

		text := e.parseStreamLine(line)
		if text != "" {
			outputBuilder.WriteString(text)
			// Publish to stream manager
			e.streamMgr.PublishText(run.ID, text)
			// Periodically update database with accumulated output
			run.Output = outputBuilder.String()
			_ = e.db.UpdateTaskRun(run)
		}
	}

	// Wait for command to finish
	cmdErr := cmd.Wait()
	endTime := time.Now()
	duration := endTime.Sub(startTime)

	// Finalize run record
	run.EndedAt = &endTime
	run.Output = outputBuilder.String()

	if cmdErr != nil {
		run.Status = db.RunStatusFailed
		errMsg := cmdErr.Error()
		if stderrOutput.Len() > 0 {
			errMsg = fmt.Sprintf("%s\n%s", errMsg, stderrOutput.String())
		}
		run.Error = errMsg
		e.streamMgr.Complete(run.ID, "failed", errMsg)
	} else {
		run.Status = db.RunStatusCompleted
		e.streamMgr.Complete(run.ID, "completed", "")
	}

	_ = e.db.UpdateTaskRun(run)

	// Update task's last run time
	task.LastRunAt = &endTime
	_ = e.db.UpdateTask(task)

	// Send webhook notifications if configured
	e.sendWebhooks(task, run)

	result := &Result{
		Output:   run.Output,
		Duration: duration,
		RunID:    run.ID,
	}
	if cmdErr != nil {
		result.Error = fmt.Errorf("%s", run.Error)
	}

	return result
}

// executeNonStreaming runs the task with buffered output (original behavior)
func (e *Executor) executeNonStreaming(ctx context.Context, task *db.Task, run *db.TaskRun, startTime time.Time) *Result {
	// Build and execute command
	// -p enables print mode (non-interactive), prompt is positional arg
	// --dangerously-skip-permissions bypasses permission prompts for scheduled tasks
	cmd := exec.CommandContext(ctx, "claude", "-p", "--dangerously-skip-permissions", task.Prompt)
	cmd.Dir = task.WorkingDir

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return e.handleExecutionError(run, task, startTime, fmt.Errorf("failed to create stdout pipe: %w", err))
	}

	stderr, err := cmd.StderrPipe()
	if err != nil {
		return e.handleExecutionError(run, task, startTime, fmt.Errorf("failed to create stderr pipe: %w", err))
	}

	if err := cmd.Start(); err != nil {
		return e.handleExecutionError(run, task, startTime, fmt.Errorf("failed to start command: %w", err))
	}

	// Read all output
	var outputBuilder strings.Builder
	scanner := bufio.NewScanner(stdout)
	buf := make([]byte, 0, 64*1024)
	scanner.Buffer(buf, 1024*1024)
	for scanner.Scan() {
		outputBuilder.WriteString(scanner.Text())
		outputBuilder.WriteString("\n")
	}

	var stderrBuilder strings.Builder
	stderrScanner := bufio.NewScanner(stderr)
	for stderrScanner.Scan() {
		stderrBuilder.WriteString(stderrScanner.Text())
		stderrBuilder.WriteString("\n")
	}

	cmdErr := cmd.Wait()
	endTime := time.Now()
	duration := endTime.Sub(startTime)

	// Update run record
	run.EndedAt = &endTime
	run.Output = outputBuilder.String()
	if cmdErr != nil {
		run.Status = db.RunStatusFailed
		run.Error = fmt.Sprintf("%s\n%s", cmdErr.Error(), stderrBuilder.String())
	} else {
		run.Status = db.RunStatusCompleted
	}
	_ = e.db.UpdateTaskRun(run)

	// Update task's last run time
	task.LastRunAt = &endTime
	_ = e.db.UpdateTask(task)

	// Send webhook notifications if configured
	e.sendWebhooks(task, run)

	result := &Result{
		Output:   run.Output,
		Duration: duration,
		RunID:    run.ID,
	}
	if cmdErr != nil {
		result.Error = fmt.Errorf("%s: %s", cmdErr.Error(), stderrBuilder.String())
	}

	return result
}

// parseStreamLine extracts text content from a Claude CLI stream-json line
func (e *Executor) parseStreamLine(line string) string {
	var event streamEvent
	if err := json.Unmarshal([]byte(line), &event); err != nil {
		// Not valid JSON, might be raw output
		return ""
	}

	// Handle content_block_delta events which contain the actual text
	if event.Type == "stream_event" {
		if event.Event.Type == "content_block_delta" && event.Event.Delta.Type == "text_delta" {
			return event.Event.Delta.Text
		}
	}

	return ""
}

// handleExecutionError creates an error result and updates the run record
func (e *Executor) handleExecutionError(run *db.TaskRun, task *db.Task, startTime time.Time, err error) *Result {
	endTime := time.Now()
	run.EndedAt = &endTime
	run.Status = db.RunStatusFailed
	run.Error = err.Error()
	_ = e.db.UpdateTaskRun(run)

	if e.streamMgr != nil {
		e.streamMgr.Complete(run.ID, "failed", err.Error())
	}

	return &Result{
		Error:    err,
		Duration: endTime.Sub(startTime),
		RunID:    run.ID,
	}
}

// sendWebhooks sends Discord and Slack notifications if configured
func (e *Executor) sendWebhooks(task *db.Task, run *db.TaskRun) {
	if task.DiscordWebhook != "" {
		_ = e.discord.SendResult(task.DiscordWebhook, task, run)
	}
	if task.SlackWebhook != "" {
		_ = e.slack.SendResult(task.SlackWebhook, task, run)
	}
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
