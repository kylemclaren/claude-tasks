package api

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/kylemclaren/claude-tasks/internal/db"
	"github.com/kylemclaren/claude-tasks/internal/usage"
	"github.com/kylemclaren/claude-tasks/internal/version"
	"github.com/robfig/cron/v3"
)

// HealthCheck handles GET /api/v1/health
func (s *Server) HealthCheck(w http.ResponseWriter, r *http.Request) {
	s.jsonResponse(w, http.StatusOK, HealthResponse{
		Status:  "ok",
		Version: version.Version,
	})
}

// ListTasks handles GET /api/v1/tasks
func (s *Server) ListTasks(w http.ResponseWriter, r *http.Request) {
	tasks, err := s.db.ListTasks()
	if err != nil {
		s.errorResponse(w, http.StatusInternalServerError, "Failed to fetch tasks", err)
		return
	}

	// Get last run statuses for all tasks
	statuses, _ := s.db.GetLastRunStatuses()

	response := TaskListResponse{
		Tasks: make([]TaskResponse, len(tasks)),
		Total: len(tasks),
	}

	for i, task := range tasks {
		response.Tasks[i] = s.taskToResponse(task, statuses[task.ID])
	}

	s.jsonResponse(w, http.StatusOK, response)
}

// CreateTask handles POST /api/v1/tasks
func (s *Server) CreateTask(w http.ResponseWriter, r *http.Request) {
	var req TaskRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.errorResponse(w, http.StatusBadRequest, "Invalid request body", err)
		return
	}

	if err := s.validateTaskRequest(&req); err != nil {
		s.errorResponse(w, http.StatusBadRequest, err.Error(), nil)
		return
	}

	task := &db.Task{
		Name:           req.Name,
		Prompt:         req.Prompt,
		CronExpr:       req.CronExpr,
		WorkingDir:     req.WorkingDir,
		DiscordWebhook: req.DiscordWebhook,
		SlackWebhook:   req.SlackWebhook,
		Enabled:        req.Enabled,
	}

	// Parse scheduled_at for one-off tasks
	if req.ScheduledAt != nil && *req.ScheduledAt != "" {
		scheduledAt, err := time.Parse(time.RFC3339, *req.ScheduledAt)
		if err != nil {
			s.errorResponse(w, http.StatusBadRequest, "Invalid scheduled_at format (use RFC3339)", err)
			return
		}
		task.ScheduledAt = &scheduledAt
	}

	if err := s.db.CreateTask(task); err != nil {
		s.errorResponse(w, http.StatusInternalServerError, "Failed to create task", err)
		return
	}

	// Schedule the task if enabled
	if task.Enabled && s.scheduler != nil {
		_ = s.scheduler.AddTask(task)
	}

	s.jsonResponse(w, http.StatusCreated, s.taskToResponse(task, ""))
}

// GetTask handles GET /api/v1/tasks/{id}
func (s *Server) GetTask(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		s.errorResponse(w, http.StatusBadRequest, "Invalid task ID", err)
		return
	}

	task, err := s.db.GetTask(id)
	if err != nil {
		s.errorResponse(w, http.StatusNotFound, "Task not found", err)
		return
	}

	// Get last run status
	var status db.RunStatus
	lastRun, _ := s.db.GetLatestTaskRun(id)
	if lastRun != nil {
		status = lastRun.Status
	}

	s.jsonResponse(w, http.StatusOK, s.taskToResponse(task, status))
}

// UpdateTask handles PUT /api/v1/tasks/{id}
func (s *Server) UpdateTask(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		s.errorResponse(w, http.StatusBadRequest, "Invalid task ID", err)
		return
	}

	task, err := s.db.GetTask(id)
	if err != nil {
		s.errorResponse(w, http.StatusNotFound, "Task not found", err)
		return
	}

	var req TaskRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.errorResponse(w, http.StatusBadRequest, "Invalid request body", err)
		return
	}

	if err := s.validateTaskRequest(&req); err != nil {
		s.errorResponse(w, http.StatusBadRequest, err.Error(), nil)
		return
	}

	// Update task fields
	task.Name = req.Name
	task.Prompt = req.Prompt
	task.CronExpr = req.CronExpr
	task.WorkingDir = req.WorkingDir
	task.DiscordWebhook = req.DiscordWebhook
	task.SlackWebhook = req.SlackWebhook
	task.Enabled = req.Enabled

	// Parse scheduled_at for one-off tasks
	if req.ScheduledAt != nil && *req.ScheduledAt != "" {
		scheduledAt, err := time.Parse(time.RFC3339, *req.ScheduledAt)
		if err != nil {
			s.errorResponse(w, http.StatusBadRequest, "Invalid scheduled_at format (use RFC3339)", err)
			return
		}
		task.ScheduledAt = &scheduledAt
	} else {
		task.ScheduledAt = nil
	}

	if err := s.db.UpdateTask(task); err != nil {
		s.errorResponse(w, http.StatusInternalServerError, "Failed to update task", err)
		return
	}

	// Update scheduler
	if s.scheduler != nil {
		_ = s.scheduler.UpdateTask(task)
	}

	s.jsonResponse(w, http.StatusOK, s.taskToResponse(task, ""))
}

// DeleteTask handles DELETE /api/v1/tasks/{id}
func (s *Server) DeleteTask(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		s.errorResponse(w, http.StatusBadRequest, "Invalid task ID", err)
		return
	}

	// Check task exists
	_, err = s.db.GetTask(id)
	if err != nil {
		s.errorResponse(w, http.StatusNotFound, "Task not found", err)
		return
	}

	// Remove from scheduler first
	if s.scheduler != nil {
		s.scheduler.RemoveTask(id)
	}

	if err := s.db.DeleteTask(id); err != nil {
		s.errorResponse(w, http.StatusInternalServerError, "Failed to delete task", err)
		return
	}

	s.jsonResponse(w, http.StatusOK, SuccessResponse{
		Success: true,
		Message: "Task deleted",
	})
}

// ToggleTask handles POST /api/v1/tasks/{id}/toggle
func (s *Server) ToggleTask(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		s.errorResponse(w, http.StatusBadRequest, "Invalid task ID", err)
		return
	}

	if err := s.db.ToggleTask(id); err != nil {
		s.errorResponse(w, http.StatusInternalServerError, "Failed to toggle task", err)
		return
	}

	// Get updated task
	task, err := s.db.GetTask(id)
	if err != nil {
		s.errorResponse(w, http.StatusInternalServerError, "Failed to fetch task", err)
		return
	}

	// Update scheduler
	if s.scheduler != nil {
		_ = s.scheduler.UpdateTask(task)
	}

	s.jsonResponse(w, http.StatusOK, s.taskToResponse(task, ""))
}

// RunTask handles POST /api/v1/tasks/{id}/run
func (s *Server) RunTask(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		s.errorResponse(w, http.StatusBadRequest, "Invalid task ID", err)
		return
	}

	task, err := s.db.GetTask(id)
	if err != nil {
		s.errorResponse(w, http.StatusNotFound, "Task not found", err)
		return
	}

	// Execute asynchronously
	go s.executor.ExecuteAsync(task)

	s.jsonResponse(w, http.StatusAccepted, SuccessResponse{
		Success: true,
		Message: "Task execution started",
	})
}

// GetTaskRuns handles GET /api/v1/tasks/{id}/runs
func (s *Server) GetTaskRuns(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		s.errorResponse(w, http.StatusBadRequest, "Invalid task ID", err)
		return
	}

	// Check task exists
	_, err = s.db.GetTask(id)
	if err != nil {
		s.errorResponse(w, http.StatusNotFound, "Task not found", err)
		return
	}

	// Get limit from query params, default 20
	limit := 20
	if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
			limit = l
		}
	}

	runs, err := s.db.GetTaskRuns(id, limit)
	if err != nil {
		s.errorResponse(w, http.StatusInternalServerError, "Failed to fetch task runs", err)
		return
	}

	response := TaskRunsResponse{
		Runs:  make([]TaskRunResponse, len(runs)),
		Total: len(runs),
	}

	for i, run := range runs {
		response.Runs[i] = s.taskRunToResponse(run)
	}

	s.jsonResponse(w, http.StatusOK, response)
}

// GetLatestTaskRun handles GET /api/v1/tasks/{id}/runs/latest
func (s *Server) GetLatestTaskRun(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		s.errorResponse(w, http.StatusBadRequest, "Invalid task ID", err)
		return
	}

	run, err := s.db.GetLatestTaskRun(id)
	if err != nil {
		s.errorResponse(w, http.StatusNotFound, "No runs found", err)
		return
	}

	s.jsonResponse(w, http.StatusOK, s.taskRunToResponse(run))
}

// GetSettings handles GET /api/v1/settings
func (s *Server) GetSettings(w http.ResponseWriter, r *http.Request) {
	threshold, _ := s.db.GetUsageThreshold()

	s.jsonResponse(w, http.StatusOK, SettingsResponse{
		UsageThreshold: threshold,
	})
}

// UpdateSettings handles PUT /api/v1/settings
func (s *Server) UpdateSettings(w http.ResponseWriter, r *http.Request) {
	var req SettingsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.errorResponse(w, http.StatusBadRequest, "Invalid request body", err)
		return
	}

	// Validate threshold
	if req.UsageThreshold < 0 || req.UsageThreshold > 100 {
		s.errorResponse(w, http.StatusBadRequest, "Usage threshold must be between 0 and 100", nil)
		return
	}

	if err := s.db.SetUsageThreshold(req.UsageThreshold); err != nil {
		s.errorResponse(w, http.StatusInternalServerError, "Failed to update settings", err)
		return
	}

	s.jsonResponse(w, http.StatusOK, SettingsResponse(req))
}

// GetUsage handles GET /api/v1/usage
func (s *Server) GetUsage(w http.ResponseWriter, r *http.Request) {
	client, err := usage.NewClient()
	if err != nil {
		s.errorResponse(w, http.StatusInternalServerError, "Usage client not available", err)
		return
	}

	data, err := client.Fetch()
	if err != nil {
		s.errorResponse(w, http.StatusInternalServerError, "Failed to fetch usage", err)
		return
	}

	s.jsonResponse(w, http.StatusOK, UsageResponse{
		FiveHour: UsageBucketResponse{
			Utilization: data.FiveHour.Utilization,
			ResetsAt:    data.FiveHour.ResetsAt,
		},
		SevenDay: UsageBucketResponse{
			Utilization: data.SevenDay.Utilization,
			ResetsAt:    data.SevenDay.ResetsAt,
		},
	})
}

// Helper functions

func (s *Server) taskToResponse(task *db.Task, status db.RunStatus) TaskResponse {
	resp := TaskResponse{
		ID:             task.ID,
		Name:           task.Name,
		Prompt:         task.Prompt,
		CronExpr:       task.CronExpr,
		ScheduledAt:    task.ScheduledAt,
		IsOneOff:       task.IsOneOff(),
		WorkingDir:     task.WorkingDir,
		DiscordWebhook: task.DiscordWebhook,
		SlackWebhook:   task.SlackWebhook,
		Enabled:        task.Enabled,
		CreatedAt:      task.CreatedAt,
		UpdatedAt:      task.UpdatedAt,
		LastRunAt:      task.LastRunAt,
		NextRunAt:      task.NextRunAt,
	}
	if status != "" {
		resp.LastRunStatus = string(status)
	}
	return resp
}

func (s *Server) taskRunToResponse(run *db.TaskRun) TaskRunResponse {
	resp := TaskRunResponse{
		ID:        run.ID,
		TaskID:    run.TaskID,
		StartedAt: run.StartedAt,
		EndedAt:   run.EndedAt,
		Status:    string(run.Status),
		Output:    run.Output,
		Error:     run.Error,
	}
	if run.EndedAt != nil {
		durationMs := run.EndedAt.Sub(run.StartedAt).Milliseconds()
		resp.DurationMs = &durationMs
	}
	return resp
}

func (s *Server) validateTaskRequest(req *TaskRequest) error {
	if req.Name == "" {
		return errEmptyName
	}
	if req.Prompt == "" {
		return errEmptyPrompt
	}
	// CronExpr is empty for one-off tasks, non-empty for recurring
	if req.CronExpr != "" {
		// Validate cron expression if provided
		parser := cron.NewParser(cron.Second | cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow)
		if _, err := parser.Parse(req.CronExpr); err != nil {
			return errInvalidCron
		}
	}
	if req.WorkingDir == "" {
		req.WorkingDir = "."
	}
	return nil
}

func (s *Server) jsonResponse(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

func (s *Server) errorResponse(w http.ResponseWriter, status int, message string, err error) {
	resp := ErrorResponse{
		Error: message,
	}
	if err != nil {
		resp.Details = err.Error()
	}
	s.jsonResponse(w, status, resp)
}

// Validation errors
type validationError string

func (e validationError) Error() string { return string(e) }

const (
	errEmptyName   validationError = "Name is required"
	errEmptyPrompt validationError = "Prompt is required"
	errInvalidCron validationError = "Invalid cron expression"
)

// GetTaskRunByID handles GET /api/v1/tasks/{id}/runs/{runId}
func (s *Server) GetTaskRunByID(w http.ResponseWriter, r *http.Request) {
	taskID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		s.errorResponse(w, http.StatusBadRequest, "Invalid task ID", err)
		return
	}

	runID, err := strconv.ParseInt(chi.URLParam(r, "runId"), 10, 64)
	if err != nil {
		s.errorResponse(w, http.StatusBadRequest, "Invalid run ID", err)
		return
	}

	// Check task exists
	_, err = s.db.GetTask(taskID)
	if err != nil {
		s.errorResponse(w, http.StatusNotFound, "Task not found", err)
		return
	}

	run, err := s.db.GetTaskRun(runID)
	if err != nil {
		s.errorResponse(w, http.StatusNotFound, "Run not found", err)
		return
	}

	// Verify run belongs to task
	if run.TaskID != taskID {
		s.errorResponse(w, http.StatusNotFound, "Run not found for this task", nil)
		return
	}

	s.jsonResponse(w, http.StatusOK, s.taskRunToResponse(run))
}

// RunTaskStreaming handles POST /api/v1/tasks/{id}/run/streaming
// Starts task execution and returns the run ID immediately for streaming
func (s *Server) RunTaskStreaming(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		s.errorResponse(w, http.StatusBadRequest, "Invalid task ID", err)
		return
	}

	task, err := s.db.GetTask(id)
	if err != nil {
		s.errorResponse(w, http.StatusNotFound, "Task not found", err)
		return
	}

	// Create task run record first so we have an ID for the client to subscribe to
	run := &db.TaskRun{
		TaskID:    task.ID,
		StartedAt: time.Now(),
		Status:    db.RunStatusRunning,
	}
	if err := s.db.CreateTaskRun(run); err != nil {
		s.errorResponse(w, http.StatusInternalServerError, "Failed to create run record", err)
		return
	}

	// Execute asynchronously using the pre-created run record
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
		defer cancel()
		s.executor.ExecuteWithRun(ctx, task, run)
	}()

	s.jsonResponse(w, http.StatusAccepted, StreamingRunResponse{
		RunID:   run.ID,
		TaskID:  task.ID,
		Status:  "running",
		Message: "Task execution started, connect to stream endpoint for real-time output",
	})
}

// StreamTaskRun handles GET /api/v1/tasks/{id}/runs/{runId}/stream
// Server-Sent Events endpoint for streaming task output in real-time
func (s *Server) StreamTaskRun(w http.ResponseWriter, r *http.Request) {
	taskID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		s.errorResponse(w, http.StatusBadRequest, "Invalid task ID", err)
		return
	}

	runID, err := strconv.ParseInt(chi.URLParam(r, "runId"), 10, 64)
	if err != nil {
		s.errorResponse(w, http.StatusBadRequest, "Invalid run ID", err)
		return
	}

	// Check task exists
	_, err = s.db.GetTask(taskID)
	if err != nil {
		s.errorResponse(w, http.StatusNotFound, "Task not found", err)
		return
	}

	// Check run exists and belongs to task
	run, err := s.db.GetTaskRun(runID)
	if err != nil {
		s.errorResponse(w, http.StatusNotFound, "Run not found", err)
		return
	}
	if run.TaskID != taskID {
		s.errorResponse(w, http.StatusNotFound, "Run not found for this task", nil)
		return
	}

	// Set SSE headers
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no") // Disable nginx buffering

	flusher, ok := w.(http.Flusher)
	if !ok {
		s.errorResponse(w, http.StatusInternalServerError, "Streaming not supported", nil)
		return
	}

	// Generate unique client ID
	clientID := generateClientID()

	// If run is already completed, send current output and complete event
	if run.Status == db.RunStatusCompleted || run.Status == db.RunStatusFailed {
		// Send accumulated output
		if run.Output != "" {
			s.writeSSEEvent(w, "output", SSEOutputChunk{
				RunID:     runID,
				Text:      run.Output,
				Timestamp: run.StartedAt.Format(time.RFC3339),
			})
			flusher.Flush()
		}

		// Send completion event
		s.writeSSEEvent(w, "complete", SSECompletionEvent{
			RunID:  runID,
			Status: string(run.Status),
			Error:  run.Error,
		})
		flusher.Flush()
		return
	}

	// Subscribe to stream
	client := s.streamMgr.Subscribe(runID, clientID)
	defer s.streamMgr.Unsubscribe(runID, clientID)

	// Send any existing output from the database first
	if run.Output != "" {
		s.writeSSEEvent(w, "output", SSEOutputChunk{
			RunID:     runID,
			Text:      run.Output,
			Timestamp: run.StartedAt.Format(time.RFC3339),
		})
		flusher.Flush()
	}

	// Stream events until completion or client disconnect
	ctx := r.Context()
	for {
		select {
		case <-ctx.Done():
			// Client disconnected
			return
		case chunk := <-client.Chunks:
			s.writeSSEEvent(w, "output", SSEOutputChunk{
				RunID:     chunk.RunID,
				Text:      chunk.Text,
				Timestamp: chunk.Timestamp.Format(time.RFC3339),
				IsError:   chunk.IsError,
			})
			flusher.Flush()
		case completion := <-client.Complete:
			s.writeSSEEvent(w, "complete", SSECompletionEvent{
				RunID:  completion.RunID,
				Status: completion.Status,
				Error:  completion.Error,
			})
			flusher.Flush()
			return
		case <-client.Done:
			// Stream manager closed the client
			return
		}
	}
}

// writeSSEEvent writes a Server-Sent Event to the response
func (s *Server) writeSSEEvent(w http.ResponseWriter, event string, data interface{}) {
	jsonData, err := json.Marshal(data)
	if err != nil {
		return
	}
	fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, string(jsonData))
}

// generateClientID creates a unique client ID using crypto/rand
func generateClientID() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		// Fallback to timestamp-based ID
		return fmt.Sprintf("client-%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(b)
}
