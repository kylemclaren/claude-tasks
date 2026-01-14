package main

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/kylemclaren/claude-tasks/internal/db"
	"github.com/kylemclaren/claude-tasks/internal/scheduler"
	"github.com/kylemclaren/claude-tasks/internal/tui"
)

func main() {
	// Determine database path
	dataDir := os.Getenv("CLAUDE_TASKS_DATA")
	if dataDir == "" {
		homeDir, err := os.UserHomeDir()
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error getting home directory: %v\n", err)
			os.Exit(1)
		}
		dataDir = filepath.Join(homeDir, ".claude-tasks")
	}

	dbPath := filepath.Join(dataDir, "tasks.db")

	// Initialize database
	database, err := db.New(dbPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error initializing database: %v\n", err)
		os.Exit(1)
	}
	defer database.Close()

	// Initialize scheduler
	sched := scheduler.New(database)
	if err := sched.Start(); err != nil {
		fmt.Fprintf(os.Stderr, "Error starting scheduler: %v\n", err)
		os.Exit(1)
	}
	defer sched.Stop()

	// Run TUI
	if err := tui.Run(database, sched); err != nil {
		fmt.Fprintf(os.Stderr, "Error running TUI: %v\n", err)
		os.Exit(1)
	}
}
