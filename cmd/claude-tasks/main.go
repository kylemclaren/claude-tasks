package main

import (
	"fmt"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"

	"github.com/kylemclaren/claude-tasks/internal/db"
	"github.com/kylemclaren/claude-tasks/internal/scheduler"
	"github.com/kylemclaren/claude-tasks/internal/tui"
	"github.com/kylemclaren/claude-tasks/internal/upgrade"
	"github.com/kylemclaren/claude-tasks/internal/version"
)

func main() {
	// Handle CLI commands
	if len(os.Args) > 1 {
		switch os.Args[1] {
		case "version", "--version", "-v":
			fmt.Println(version.Info())
			return
		case "upgrade":
			if err := upgrade.Upgrade(); err != nil {
				fmt.Fprintf(os.Stderr, "Error: %v\n", err)
				os.Exit(1)
			}
			return
		case "help", "--help", "-h":
			printHelp()
			return
		case "daemon":
			if err := runDaemon(); err != nil {
				fmt.Fprintf(os.Stderr, "Error: %v\n", err)
				os.Exit(1)
			}
			return
		default:
			fmt.Fprintf(os.Stderr, "Unknown command: %s\n\n", os.Args[1])
			printHelp()
			os.Exit(1)
		}
	}

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
	pidPath := filepath.Join(dataDir, "daemon.pid")

	// Initialize database
	database, err := db.New(dbPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error initializing database: %v\n", err)
		os.Exit(1)
	}
	defer database.Close()

	// Check if daemon is running
	daemonPID, daemonRunning := isDaemonRunning(pidPath)

	var sched *scheduler.Scheduler
	if daemonRunning {
		// Daemon is running, TUI operates in client mode
		fmt.Printf("Daemon running (PID %d), TUI in client mode\n", daemonPID)
	} else {
		// No daemon, start our own scheduler
		sched = scheduler.New(database)
		if err := sched.Start(); err != nil {
			fmt.Fprintf(os.Stderr, "Error starting scheduler: %v\n", err)
			os.Exit(1)
		}
		defer sched.Stop()
	}

	// Run TUI
	if err := tui.Run(database, sched, daemonRunning); err != nil {
		fmt.Fprintf(os.Stderr, "Error running TUI: %v\n", err)
		os.Exit(1)
	}
}

func runDaemon() error {
	dataDir := os.Getenv("CLAUDE_TASKS_DATA")
	if dataDir == "" {
		homeDir, err := os.UserHomeDir()
		if err != nil {
			return fmt.Errorf("getting home directory: %w", err)
		}
		dataDir = filepath.Join(homeDir, ".claude-tasks")
	}

	dbPath := filepath.Join(dataDir, "tasks.db")
	pidPath := filepath.Join(dataDir, "daemon.pid")

	// Check if daemon is already running
	if pid, running := isDaemonRunning(pidPath); running {
		return fmt.Errorf("daemon already running (PID %d)", pid)
	}

	// Write PID file
	if err := os.WriteFile(pidPath, []byte(fmt.Sprintf("%d", os.Getpid())), 0644); err != nil {
		return fmt.Errorf("writing PID file: %w", err)
	}
	defer os.Remove(pidPath)

	database, err := db.New(dbPath)
	if err != nil {
		return fmt.Errorf("initializing database: %w", err)
	}
	defer database.Close()

	sched := scheduler.New(database)
	if err := sched.Start(); err != nil {
		return fmt.Errorf("starting scheduler: %w", err)
	}
	defer sched.Stop()

	fmt.Println("claude-tasks daemon started")
	fmt.Printf("PID: %d\n", os.Getpid())
	fmt.Printf("Database: %s\n", dbPath)

	// Wait for shutdown signal
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	<-sigCh

	fmt.Println("\nShutting down...")
	return nil
}

// isDaemonRunning checks if a daemon is running by reading PID file and checking process
func isDaemonRunning(pidPath string) (int, bool) {
	data, err := os.ReadFile(pidPath)
	if err != nil {
		return 0, false
	}

	var pid int
	if _, err := fmt.Sscanf(string(data), "%d", &pid); err != nil {
		return 0, false
	}

	// Check if process exists
	process, err := os.FindProcess(pid)
	if err != nil {
		return 0, false
	}

	// On Unix, FindProcess always succeeds, so send signal 0 to check if alive
	if err := process.Signal(syscall.Signal(0)); err != nil {
		return 0, false
	}

	return pid, true
}

func printHelp() {
	fmt.Println(`claude-tasks - Schedule and run Claude CLI tasks via cron

Usage:
  claude-tasks              Launch the interactive TUI
  claude-tasks daemon       Run scheduler in foreground (for services)
  claude-tasks version      Show version information
  claude-tasks upgrade      Upgrade to the latest version
  claude-tasks help         Show this help message

Environment Variables:
  CLAUDE_TASKS_DATA         Override data directory (default: ~/.claude-tasks)

For more information, visit: https://github.com/kylemclaren/claude-tasks`)
}
