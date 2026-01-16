package scheduler

import (
	"fmt"
	"sync"
	"time"

	"github.com/kylemclaren/claude-tasks/internal/db"
	"github.com/kylemclaren/claude-tasks/internal/executor"
	"github.com/kylemclaren/claude-tasks/internal/stream"
	"github.com/robfig/cron/v3"
)

// Scheduler manages cron jobs for tasks
type Scheduler struct {
	cron         *cron.Cron
	db           *db.DB
	executor     *executor.Executor
	streamMgr    *stream.Manager
	jobs         map[int64]cron.EntryID
	cronExprs    map[int64]string      // Track cron expressions to detect changes
	oneOffTimers map[int64]*time.Timer // Track one-off task timers
	mu           sync.RWMutex
	running      bool
	stopSync     chan struct{}
}

// New creates a new scheduler
func New(database *db.DB) *Scheduler {
	return &Scheduler{
		cron:         cron.New(cron.WithSeconds()),
		db:           database,
		executor:     executor.New(database),
		jobs:         make(map[int64]cron.EntryID),
		cronExprs:    make(map[int64]string),
		oneOffTimers: make(map[int64]*time.Timer),
		stopSync:     make(chan struct{}),
	}
}

// NewWithStreamManager creates a new scheduler with stream manager for real-time output
func NewWithStreamManager(database *db.DB, streamMgr *stream.Manager) *Scheduler {
	return &Scheduler{
		cron:         cron.New(cron.WithSeconds()),
		db:           database,
		executor:     executor.NewWithStreamManager(database, streamMgr),
		streamMgr:    streamMgr,
		jobs:         make(map[int64]cron.EntryID),
		cronExprs:    make(map[int64]string),
		oneOffTimers: make(map[int64]*time.Timer),
		stopSync:     make(chan struct{}),
	}
}

// SetStreamManager sets the stream manager for real-time output
func (s *Scheduler) SetStreamManager(mgr *stream.Manager) {
	s.streamMgr = mgr
	s.executor.SetStreamManager(mgr)
}

// GetStreamManager returns the stream manager
func (s *Scheduler) GetStreamManager() *stream.Manager {
	return s.streamMgr
}

// Start starts the scheduler and loads existing tasks
func (s *Scheduler) Start() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.running {
		return nil
	}

	// Clean up any stale "running" task runs from previous server instance
	if affected, err := s.db.MarkStaleRunsAsFailed(); err != nil {
		fmt.Printf("Warning: failed to clean up stale runs: %v\n", err)
	} else if affected > 0 {
		fmt.Printf("Cleaned up %d stale running task(s) from previous server instance\n", affected)
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

	// Start background sync to pick up DB changes
	go s.syncLoop()

	return nil
}

// Stop stops the scheduler
func (s *Scheduler) Stop() {
	s.mu.Lock()
	if !s.running {
		s.mu.Unlock()
		return
	}
	s.running = false

	// Cancel all one-off timers
	for _, timer := range s.oneOffTimers {
		timer.Stop()
	}
	s.oneOffTimers = make(map[int64]*time.Timer)

	s.mu.Unlock()

	// Stop sync loop
	close(s.stopSync)

	ctx := s.cron.Stop()
	<-ctx.Done()
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

	// Remove cron job if exists
	if entryID, ok := s.jobs[taskID]; ok {
		s.cron.Remove(entryID)
		delete(s.jobs, taskID)
		delete(s.cronExprs, taskID)
	}

	// Cancel one-off timer if exists
	if timer, ok := s.oneOffTimers[taskID]; ok {
		timer.Stop()
		delete(s.oneOffTimers, taskID)
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

	// Check cron jobs
	if entryID, ok := s.jobs[taskID]; ok {
		entry := s.cron.Entry(entryID)
		if !entry.Next.IsZero() {
			return &entry.Next
		}
	}

	// Check one-off tasks (return from DB since timer doesn't expose time)
	if _, ok := s.oneOffTimers[taskID]; ok {
		task, err := s.db.GetTask(taskID)
		if err == nil && task.NextRunAt != nil {
			return task.NextRunAt
		}
	}

	return nil
}

// GetAllNextRunTimes returns next run times for all scheduled tasks
func (s *Scheduler) GetAllNextRunTimes() map[int64]time.Time {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make(map[int64]time.Time)

	// Get cron job next runs
	for taskID, entryID := range s.jobs {
		entry := s.cron.Entry(entryID)
		if !entry.Next.IsZero() {
			result[taskID] = entry.Next
		}
	}

	// Get one-off task next runs from DB
	for taskID := range s.oneOffTimers {
		task, err := s.db.GetTask(taskID)
		if err == nil && task.NextRunAt != nil {
			result[taskID] = *task.NextRunAt
		}
	}

	return result
}

func (s *Scheduler) scheduleTaskLocked(task *db.Task) error {
	// Route one-off tasks to separate handler
	if task.IsOneOff() {
		return s.scheduleOneOffTaskLocked(task)
	}

	// Remove existing job if any
	if entryID, ok := s.jobs[task.ID]; ok {
		s.cron.Remove(entryID)
		delete(s.jobs, task.ID)
	}

	// Create a copy of task ID for the closure
	taskID := task.ID

	entryID, err := s.cron.AddFunc(task.CronExpr, func() {
		// Get fresh task data from DB
		freshTask, err := s.db.GetTask(taskID)
		if err != nil {
			fmt.Printf("Failed to get task %d: %v\n", taskID, err)
			return
		}
		if !freshTask.Enabled {
			return
		}
		s.executor.ExecuteAsync(freshTask)

		// Update next run time in DB after execution
		s.mu.RLock()
		if eid, ok := s.jobs[taskID]; ok {
			entry := s.cron.Entry(eid)
			if !entry.Next.IsZero() {
				freshTask.NextRunAt = &entry.Next
				_ = s.db.UpdateTask(freshTask)
			}
		}
		s.mu.RUnlock()
	})
	if err != nil {
		return fmt.Errorf("invalid cron expression: %w", err)
	}

	s.jobs[task.ID] = entryID
	s.cronExprs[task.ID] = task.CronExpr

	// Update next run time in DB
	entry := s.cron.Entry(entryID)
	if !entry.Next.IsZero() {
		task.NextRunAt = &entry.Next
		_ = s.db.UpdateTask(task)
	}

	return nil
}

// scheduleOneOffTaskLocked schedules a one-off task
func (s *Scheduler) scheduleOneOffTaskLocked(task *db.Task) error {
	// Cancel existing timer if any
	if timer, ok := s.oneOffTimers[task.ID]; ok {
		timer.Stop()
		delete(s.oneOffTimers, task.ID)
	}

	taskID := task.ID

	// If no scheduled time, run immediately
	if task.ScheduledAt == nil {
		go s.executeOneOff(taskID)
		return nil
	}

	delay := time.Until(*task.ScheduledAt)
	if delay <= 0 {
		// Scheduled time has passed, run immediately
		go s.executeOneOff(taskID)
		return nil
	}

	// Schedule for future execution
	timer := time.AfterFunc(delay, func() {
		s.executeOneOff(taskID)
	})
	s.oneOffTimers[task.ID] = timer

	// Update NextRunAt in DB
	task.NextRunAt = task.ScheduledAt
	_ = s.db.UpdateTask(task)

	return nil
}

// executeOneOff runs a one-off task and disables it afterward
func (s *Scheduler) executeOneOff(taskID int64) {
	// Get fresh task data
	task, err := s.db.GetTask(taskID)
	if err != nil {
		fmt.Printf("Failed to get one-off task %d: %v\n", taskID, err)
		return
	}
	if !task.Enabled {
		return
	}

	// Execute the task
	s.executor.ExecuteAsync(task)

	// Auto-disable the task after execution
	task.Enabled = false
	task.NextRunAt = nil
	_ = s.db.UpdateTask(task)

	// Clean up timer reference
	s.mu.Lock()
	delete(s.oneOffTimers, taskID)
	s.mu.Unlock()
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

// syncLoop periodically syncs tasks from DB
func (s *Scheduler) syncLoop() {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-s.stopSync:
			return
		case <-ticker.C:
			s.SyncTasks()
		}
	}
}

// SyncTasks reloads tasks from DB and updates scheduler
func (s *Scheduler) SyncTasks() {
	tasks, err := s.db.ListTasks()
	if err != nil {
		return
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	// Build set of current task IDs in DB
	dbTaskIDs := make(map[int64]bool)
	for _, task := range tasks {
		dbTaskIDs[task.ID] = true
	}

	// Remove cron jobs for tasks that no longer exist
	for taskID := range s.jobs {
		if !dbTaskIDs[taskID] {
			if entryID, ok := s.jobs[taskID]; ok {
				s.cron.Remove(entryID)
				delete(s.jobs, taskID)
				delete(s.cronExprs, taskID)
			}
		}
	}

	// Remove one-off timers for tasks that no longer exist
	for taskID := range s.oneOffTimers {
		if !dbTaskIDs[taskID] {
			if timer, ok := s.oneOffTimers[taskID]; ok {
				timer.Stop()
				delete(s.oneOffTimers, taskID)
			}
		}
	}

	// Add/update tasks
	for _, task := range tasks {
		_, hasCronJob := s.jobs[task.ID]
		_, hasOneOffTimer := s.oneOffTimers[task.ID]
		isScheduled := hasCronJob || hasOneOffTimer
		oldCronExpr := s.cronExprs[task.ID]

		if task.Enabled && !isScheduled {
			// Task should be scheduled but isn't
			_ = s.scheduleTaskLocked(task)
		} else if !task.Enabled && isScheduled {
			// Task shouldn't be scheduled but is - remove it
			if entryID, ok := s.jobs[task.ID]; ok {
				s.cron.Remove(entryID)
				delete(s.jobs, task.ID)
				delete(s.cronExprs, task.ID)
			}
			if timer, ok := s.oneOffTimers[task.ID]; ok {
				timer.Stop()
				delete(s.oneOffTimers, task.ID)
			}
		} else if task.Enabled && hasCronJob && task.IsOneOff() {
			// Task was converted from recurring to one-off, reschedule
			s.cron.Remove(s.jobs[task.ID])
			delete(s.jobs, task.ID)
			delete(s.cronExprs, task.ID)
			_ = s.scheduleTaskLocked(task)
		} else if task.Enabled && hasOneOffTimer && !task.IsOneOff() {
			// Task was converted from one-off to recurring, reschedule
			s.oneOffTimers[task.ID].Stop()
			delete(s.oneOffTimers, task.ID)
			_ = s.scheduleTaskLocked(task)
		} else if task.Enabled && hasCronJob && task.CronExpr != oldCronExpr {
			// Cron expression changed, reschedule
			_ = s.scheduleTaskLocked(task)
		}
	}
}
