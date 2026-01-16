package db

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

// DB wraps the SQLite database connection
type DB struct {
	conn *sql.DB
}

// New creates a new database connection
func New(dbPath string) (*DB, error) {
	// Ensure directory exists
	dir := filepath.Dir(dbPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create db directory: %w", err)
	}

	conn, err := sql.Open("sqlite3", dbPath+"?_foreign_keys=on")
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	db := &DB{conn: conn}
	if err := db.migrate(); err != nil {
		conn.Close()
		return nil, fmt.Errorf("failed to migrate database: %w", err)
	}

	return db, nil
}

// Close closes the database connection
func (db *DB) Close() error {
	return db.conn.Close()
}

func (db *DB) migrate() error {
	schema := `
	CREATE TABLE IF NOT EXISTS tasks (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL,
		prompt TEXT NOT NULL,
		cron_expr TEXT NOT NULL,
		working_dir TEXT NOT NULL DEFAULT '.',
		discord_webhook TEXT DEFAULT '',
		slack_webhook TEXT DEFAULT '',
		enabled INTEGER NOT NULL DEFAULT 1,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		last_run_at DATETIME,
		next_run_at DATETIME
	);

	CREATE TABLE IF NOT EXISTS task_runs (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		task_id INTEGER NOT NULL,
		started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		ended_at DATETIME,
		status TEXT NOT NULL DEFAULT 'pending',
		output TEXT DEFAULT '',
		error TEXT DEFAULT '',
		FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
	);

	CREATE INDEX IF NOT EXISTS idx_task_runs_task_id ON task_runs(task_id);
	CREATE INDEX IF NOT EXISTS idx_task_runs_started_at ON task_runs(started_at);

	CREATE TABLE IF NOT EXISTS settings (
		key TEXT PRIMARY KEY,
		value TEXT NOT NULL
	);

	-- Default usage threshold of 80%
	INSERT OR IGNORE INTO settings (key, value) VALUES ('usage_threshold', '80');
	`

	_, err := db.conn.Exec(schema)
	if err != nil {
		return err
	}

	// Migration: Add slack_webhook column if it doesn't exist
	_, _ = db.conn.Exec("ALTER TABLE tasks ADD COLUMN slack_webhook TEXT DEFAULT ''")

	// Migration: Add scheduled_at column for one-off tasks
	_, _ = db.conn.Exec("ALTER TABLE tasks ADD COLUMN scheduled_at DATETIME")

	return nil
}

// GetSetting retrieves a setting value
func (db *DB) GetSetting(key string) (string, error) {
	var value string
	err := db.conn.QueryRow("SELECT value FROM settings WHERE key = ?", key).Scan(&value)
	if err != nil {
		return "", err
	}
	return value, nil
}

// SetSetting sets a setting value
func (db *DB) SetSetting(key, value string) error {
	_, err := db.conn.Exec("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", key, value)
	return err
}

// GetUsageThreshold retrieves the usage threshold as a float
func (db *DB) GetUsageThreshold() (float64, error) {
	val, err := db.GetSetting("usage_threshold")
	if err != nil {
		return 80, nil // Default to 80%
	}
	var threshold float64
	_, err = fmt.Sscanf(val, "%f", &threshold)
	if err != nil {
		return 80, nil
	}
	return threshold, nil
}

// SetUsageThreshold sets the usage threshold
func (db *DB) SetUsageThreshold(threshold float64) error {
	return db.SetSetting("usage_threshold", fmt.Sprintf("%.0f", threshold))
}

// CreateTask creates a new task
func (db *DB) CreateTask(task *Task) error {
	result, err := db.conn.Exec(`
		INSERT INTO tasks (name, prompt, cron_expr, scheduled_at, working_dir, discord_webhook, slack_webhook, enabled, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, task.Name, task.Prompt, task.CronExpr, task.ScheduledAt, task.WorkingDir, task.DiscordWebhook, task.SlackWebhook, task.Enabled, time.Now(), time.Now())
	if err != nil {
		return err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return err
	}
	task.ID = id
	return nil
}

// GetTask retrieves a task by ID
func (db *DB) GetTask(id int64) (*Task, error) {
	task := &Task{}
	err := db.conn.QueryRow(`
		SELECT id, name, prompt, cron_expr, scheduled_at, working_dir, discord_webhook, slack_webhook, enabled, created_at, updated_at, last_run_at, next_run_at
		FROM tasks WHERE id = ?
	`, id).Scan(&task.ID, &task.Name, &task.Prompt, &task.CronExpr, &task.ScheduledAt, &task.WorkingDir, &task.DiscordWebhook, &task.SlackWebhook, &task.Enabled, &task.CreatedAt, &task.UpdatedAt, &task.LastRunAt, &task.NextRunAt)
	if err != nil {
		return nil, err
	}
	return task, nil
}

// ListTasks retrieves all tasks
func (db *DB) ListTasks() ([]*Task, error) {
	rows, err := db.conn.Query(`
		SELECT id, name, prompt, cron_expr, scheduled_at, working_dir, discord_webhook, slack_webhook, enabled, created_at, updated_at, last_run_at, next_run_at
		FROM tasks ORDER BY created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tasks []*Task
	for rows.Next() {
		task := &Task{}
		err := rows.Scan(&task.ID, &task.Name, &task.Prompt, &task.CronExpr, &task.ScheduledAt, &task.WorkingDir, &task.DiscordWebhook, &task.SlackWebhook, &task.Enabled, &task.CreatedAt, &task.UpdatedAt, &task.LastRunAt, &task.NextRunAt)
		if err != nil {
			return nil, err
		}
		tasks = append(tasks, task)
	}
	return tasks, rows.Err()
}

// UpdateTask updates a task
func (db *DB) UpdateTask(task *Task) error {
	task.UpdatedAt = time.Now()
	_, err := db.conn.Exec(`
		UPDATE tasks SET name = ?, prompt = ?, cron_expr = ?, scheduled_at = ?, working_dir = ?, discord_webhook = ?, slack_webhook = ?, enabled = ?, updated_at = ?, last_run_at = ?, next_run_at = ?
		WHERE id = ?
	`, task.Name, task.Prompt, task.CronExpr, task.ScheduledAt, task.WorkingDir, task.DiscordWebhook, task.SlackWebhook, task.Enabled, task.UpdatedAt, task.LastRunAt, task.NextRunAt, task.ID)
	return err
}

// DeleteTask deletes a task
func (db *DB) DeleteTask(id int64) error {
	_, err := db.conn.Exec("DELETE FROM tasks WHERE id = ?", id)
	return err
}

// ToggleTask enables or disables a task
func (db *DB) ToggleTask(id int64) error {
	_, err := db.conn.Exec("UPDATE tasks SET enabled = NOT enabled, updated_at = ? WHERE id = ?", time.Now(), id)
	return err
}

// CreateTaskRun creates a new task run record
func (db *DB) CreateTaskRun(run *TaskRun) error {
	result, err := db.conn.Exec(`
		INSERT INTO task_runs (task_id, started_at, status, output, error)
		VALUES (?, ?, ?, ?, ?)
	`, run.TaskID, run.StartedAt, run.Status, run.Output, run.Error)
	if err != nil {
		return err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return err
	}
	run.ID = id
	return nil
}

// UpdateTaskRun updates a task run
func (db *DB) UpdateTaskRun(run *TaskRun) error {
	_, err := db.conn.Exec(`
		UPDATE task_runs SET ended_at = ?, status = ?, output = ?, error = ?
		WHERE id = ?
	`, run.EndedAt, run.Status, run.Output, run.Error, run.ID)
	return err
}

// GetTaskRuns retrieves runs for a task
func (db *DB) GetTaskRuns(taskID int64, limit int) ([]*TaskRun, error) {
	rows, err := db.conn.Query(`
		SELECT id, task_id, started_at, ended_at, status, output, error
		FROM task_runs WHERE task_id = ? ORDER BY started_at DESC LIMIT ?
	`, taskID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var runs []*TaskRun
	for rows.Next() {
		run := &TaskRun{}
		err := rows.Scan(&run.ID, &run.TaskID, &run.StartedAt, &run.EndedAt, &run.Status, &run.Output, &run.Error)
		if err != nil {
			return nil, err
		}
		runs = append(runs, run)
	}
	return runs, rows.Err()
}

// GetLatestTaskRun retrieves the most recent run for a task
func (db *DB) GetLatestTaskRun(taskID int64) (*TaskRun, error) {
	run := &TaskRun{}
	err := db.conn.QueryRow(`
		SELECT id, task_id, started_at, ended_at, status, output, error
		FROM task_runs WHERE task_id = ? ORDER BY started_at DESC LIMIT 1
	`, taskID).Scan(&run.ID, &run.TaskID, &run.StartedAt, &run.EndedAt, &run.Status, &run.Output, &run.Error)
	if err != nil {
		return nil, err
	}
	return run, nil
}

// GetLastRunStatuses retrieves the last run status for all tasks
func (db *DB) GetLastRunStatuses() (map[int64]RunStatus, error) {
	rows, err := db.conn.Query(`
		SELECT task_id, status FROM task_runs
		WHERE id IN (
			SELECT MAX(id) FROM task_runs GROUP BY task_id
		)
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	statuses := make(map[int64]RunStatus)
	for rows.Next() {
		var taskID int64
		var status string
		if err := rows.Scan(&taskID, &status); err != nil {
			return nil, err
		}
		statuses[taskID] = RunStatus(status)
	}
	return statuses, rows.Err()
}

// GetTaskRun retrieves a specific task run by ID
func (db *DB) GetTaskRun(runID int64) (*TaskRun, error) {
	run := &TaskRun{}
	err := db.conn.QueryRow(`
		SELECT id, task_id, started_at, ended_at, status, output, error
		FROM task_runs WHERE id = ?
	`, runID).Scan(&run.ID, &run.TaskID, &run.StartedAt, &run.EndedAt, &run.Status, &run.Output, &run.Error)
	if err != nil {
		return nil, err
	}
	return run, nil
}

// GetRunningRuns retrieves all task runs that are currently in "running" status
// This is useful for cleaning up stale runs on startup
func (db *DB) GetRunningRuns() ([]*TaskRun, error) {
	rows, err := db.conn.Query(`
		SELECT id, task_id, started_at, ended_at, status, output, error
		FROM task_runs WHERE status = ?
	`, RunStatusRunning)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var runs []*TaskRun
	for rows.Next() {
		run := &TaskRun{}
		err := rows.Scan(&run.ID, &run.TaskID, &run.StartedAt, &run.EndedAt, &run.Status, &run.Output, &run.Error)
		if err != nil {
			return nil, err
		}
		runs = append(runs, run)
	}
	return runs, rows.Err()
}

// MarkStaleRunsAsFailed marks all "running" task runs as failed
// This is called on startup to clean up runs that were interrupted by server restart
func (db *DB) MarkStaleRunsAsFailed() (int64, error) {
	result, err := db.conn.Exec(`
		UPDATE task_runs
		SET status = ?, error = 'Server restarted during execution', ended_at = CURRENT_TIMESTAMP
		WHERE status = ?
	`, RunStatusFailed, RunStatusRunning)
	if err != nil {
		return 0, err
	}
	return result.RowsAffected()
}
