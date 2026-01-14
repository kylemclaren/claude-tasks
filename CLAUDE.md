# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

```bash
# Build
go build -o claude-tasks ./cmd/claude-tasks

# Run tests
go test -v ./...

# Lint (requires golangci-lint)
golangci-lint run --timeout=5m

# Release build with optimizations
go build -ldflags="-s -w" -o claude-tasks ./cmd/claude-tasks
```

## Architecture

Claude Tasks is a Go TUI application for scheduling Claude CLI tasks via cron expressions. The data is stored in SQLite at `~/.claude-tasks/tasks.db`.

### Package Structure

```
cmd/claude-tasks/main.go   Entry point - initializes DB, starts scheduler, launches TUI
internal/
  tui/                     Bubble Tea TUI (views: list, add, edit, output, settings)
  scheduler/               Cron job scheduling (robfig/cron, 6-field with seconds)
  executor/                Claude CLI subprocess execution, captures output
  db/                      SQLite models (Task, TaskRun) and CRUD operations
  usage/                   Anthropic API usage tracking, threshold enforcement
  webhook/                 Discord webhook notifications
```

### Execution Flow

1. Scheduler triggers task based on cron expression
2. Executor checks API usage against threshold (default 80%)
3. If under threshold, spawns Claude CLI with task prompt in configured working directory
4. Captures output, creates TaskRun record
5. Posts to Discord webhook if configured
6. Updates next run time

### Key Dependencies

- **charmbracelet/bubbletea** - TUI framework
- **charmbracelet/bubbles** - Table, spinner, viewport, progress components
- **charmbracelet/lipgloss** - Terminal styling
- **charmbracelet/glamour** - Markdown rendering
- **robfig/cron/v3** - Cron scheduling (6-field: `second minute hour day month weekday`)
- **mattn/go-sqlite3** - SQLite driver (CGO required)

### Data Storage

- Default location: `~/.claude-tasks/`
- Override with `CLAUDE_TASKS_DATA` environment variable
- Database auto-migrates on startup

## TUI Keybindings

| Key | Action |
|-----|--------|
| `a` | Add task |
| `e` | Edit task |
| `d` | Delete task |
| `t` | Toggle enabled |
| `r` | Run immediately |
| `Enter` | View output |
| `s` | Settings |
| `q` | Quit |
