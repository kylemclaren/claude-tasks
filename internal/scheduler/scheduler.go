package scheduler

import (
	"fmt"
	"sync"
	"time"

	"github.com/robfig/cron/v3"
	"github.com/kylemclaren/claude-tasks/internal/db"
	"github.com/kylemclaren/claude-tasks/internal/executor"
)

// Scheduler manages cron jobs for tasks
type Scheduler struct {
	cron     *cron.Cron
	db       *db.DB
	executor *executor.Executor
	jobs     map[int64]cron.EntryID
	mu       sync.RWMutex
	running  bool
}

// New creates a new scheduler
func New(database *db.DB) *Scheduler {
	return &Scheduler{
		cron:     cron.New(cron.WithSeconds()),
		db:       database,
		executor: executor.New(database),
		jobs:     make(map[int64]cron.EntryID),
	}
}

// Start starts the scheduler and loads existing tasks
func (s *Scheduler) Start() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.running {
		return nil
	}

	// Load and schedule existing tasks
	tasks, err := s.db.ListTasks()
	if err != nil {
		return fmt.Errorf("failed to load tasks: %w", err)
	}

	for _, task := range tasks {
		if task.Enabled {
			if err := s.scheduleTaskLocked(task); err != nil {
				// Log error but continue with other tasks
				fmt.Printf("Failed to schedule task %d: %v\n", task.ID, err)
			}
		}
	}

	s.cron.Start()
	s.running = true
	return nil
}

// Stop stops the scheduler
func (s *Scheduler) Stop() {
	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.running {
		return
	}

	ctx := s.cron.Stop()
	<-ctx.Done()
	s.running = false
}

// AddTask schedules a new task
func (s *Scheduler) AddTask(task *db.Task) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	return s.scheduleTaskLocked(task)
}

// RemoveTask removes a task from the scheduler
func (s *Scheduler) RemoveTask(taskID int64) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if entryID, ok := s.jobs[taskID]; ok {
		s.cron.Remove(entryID)
		delete(s.jobs, taskID)
	}
}

// UpdateTask updates a task's schedule
func (s *Scheduler) UpdateTask(task *db.Task) error {
	s.RemoveTask(task.ID)
	if task.Enabled {
		return s.AddTask(task)
	}
	return nil
}

// GetNextRunTime returns the next scheduled run time for a task
func (s *Scheduler) GetNextRunTime(taskID int64) *time.Time {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if entryID, ok := s.jobs[taskID]; ok {
		entry := s.cron.Entry(entryID)
		if !entry.Next.IsZero() {
			return &entry.Next
		}
	}
	return nil
}

// GetAllNextRunTimes returns next run times for all scheduled tasks
func (s *Scheduler) GetAllNextRunTimes() map[int64]time.Time {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make(map[int64]time.Time)
	for taskID, entryID := range s.jobs {
		entry := s.cron.Entry(entryID)
		if !entry.Next.IsZero() {
			result[taskID] = entry.Next
		}
	}
	return result
}

func (s *Scheduler) scheduleTaskLocked(task *db.Task) error {
	// Remove existing job if any
	if entryID, ok := s.jobs[task.ID]; ok {
		s.cron.Remove(entryID)
		delete(s.jobs, task.ID)
	}

	// Create a copy of task for the closure
	taskCopy := *task

	entryID, err := s.cron.AddFunc(task.CronExpr, func() {
		// Get fresh task data from DB
		freshTask, err := s.db.GetTask(taskCopy.ID)
		if err != nil {
			fmt.Printf("Failed to get task %d: %v\n", taskCopy.ID, err)
			return
		}
		if !freshTask.Enabled {
			return
		}
		s.executor.ExecuteAsync(freshTask)
	})
	if err != nil {
		return fmt.Errorf("invalid cron expression: %w", err)
	}

	s.jobs[task.ID] = entryID

	// Update next run time in DB
	entry := s.cron.Entry(entryID)
	if !entry.Next.IsZero() {
		task.NextRunAt = &entry.Next
		_ = s.db.UpdateTask(task)
	}

	return nil
}

// RunTaskNow executes a task immediately
func (s *Scheduler) RunTaskNow(taskID int64) error {
	task, err := s.db.GetTask(taskID)
	if err != nil {
		return fmt.Errorf("task not found: %w", err)
	}

	go func() {
		s.executor.ExecuteAsync(task)
	}()

	return nil
}
