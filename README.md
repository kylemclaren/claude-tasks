<img width="978" height="603" alt="Screenshot 2026-01-14 at 21 18 04" src="https://github.com/user-attachments/assets/476bb9c9-e4d6-4e16-8ee2-9364c6d07aa3" />

# Claude Tasks

A TUI scheduler for running Claude tasks on a cron schedule. Built with [Bubble Tea](https://github.com/charmbracelet/bubbletea).

![Claude Tasks TUI](https://img.shields.io/badge/TUI-BubbleTea-ff69b4)
![Go](https://img.shields.io/badge/Go-1.24+-00ADD8)

## Features

- **Cron Scheduling** - Schedule Claude tasks using 6-field cron expressions (second granularity)
- **Real-time TUI** - Beautiful terminal interface with live updates, spinners, and progress bars
- **Discord Webhooks** - Get task results posted to Discord channels
- **Usage Tracking** - Monitor your Anthropic API usage with visual progress bars
- **Usage Thresholds** - Automatically skip tasks when usage exceeds a configurable threshold
- **Markdown Rendering** - Task output rendered with [Glamour](https://github.com/charmbracelet/glamour)
- **SQLite Storage** - Persistent task and run history

## Installation

### Quick Install (Recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/kylemclaren/claude-tasks/main/install.sh | bash
```

This downloads the latest binary for your platform to `~/.local/bin/`.

### Build from Source

```bash
# Clone the repo
git clone https://github.com/kylemclaren/claude-tasks.git
cd claude-tasks

# Build
go build -o claude-tasks ./cmd/claude-tasks

# Run
./claude-tasks
```

### Requirements

- Go 1.24+
- [Claude CLI](https://github.com/anthropics/claude-code) installed and authenticated
- SQLite (bundled via go-sqlite3)

## Usage

### Keybindings

| Key | Action |
|-----|--------|
| `a` | Add new task |
| `e` | Edit selected task |
| `d` | Delete selected task |
| `t` | Toggle task enabled/disabled |
| `r` | Run task immediately |
| `Enter` | View task output history |
| `s` | Settings (usage threshold) |
| `?` | Toggle full help |
| `q` | Quit |

### Cron Format

Uses 6-field cron expressions: `second minute hour day month weekday`

```
0 * * * * *      # Every minute
0 0 9 * * *      # Every day at 9:00 AM
0 30 8 * * 1-5   # Weekdays at 8:30 AM
0 0 */2 * * *    # Every 2 hours
0 0 9 * * 0      # Every Sunday at 9:00 AM
```

### Discord Webhooks

Add a Discord webhook URL when creating a task to receive notifications:

- Task completion status (success/failure)
- Execution duration
- Output (truncated if too long)
- Error details if failed

### Usage Threshold

Press `s` to configure the usage threshold (default: 80%). When your Anthropic API usage exceeds this threshold, scheduled tasks will be skipped to preserve quota.

The header shows real-time usage:
```
◆ Claude Tasks  5h ████░░░░░░ 42% │ 7d ██████░░░░ 61% │ ⏱ 2h15m │ ⚡ 80%
```

## Configuration

Data is stored in `~/.claude-tasks/`:
- `tasks.db` - SQLite database with tasks, runs, and settings

Override the data directory:
```bash
CLAUDE_TASKS_DATA=/custom/path ./claude-tasks
```

## Example Tasks

### Development Workflow

| Task | Schedule | Prompt |
|------|----------|--------|
| Daily Code Review | 6pm daily | Review any uncommitted changes in this repo. Summarize what was worked on and flag any potential issues. |
| Morning Standup Prep | 8:30am weekdays | Analyze git log from the last 24 hours and prepare a brief standup summary of what was accomplished. |
| Dependency Audit | 9am Mondays | Check go.mod for outdated dependencies and security vulnerabilities. Suggest updates if needed. |
| Security Scan | 9am Sundays | Audit code for common security issues: SQL injection, XSS, hardcoded secrets, unsafe operations. |
| Weekly Summary | 5pm Fridays | Generate a weekly development summary from git history. Include stats, highlights, and next steps. |

### Data & Analysis

| Task | Schedule | Prompt |
|------|----------|--------|
| HN Sentiment Analysis | 9am daily | Pull the top 10 HackerNews stories and run sentiment analysis on all the comments using python and then list the posts with their analysis |
| GitHub Trending | 9am Mondays | Pull trending GitHub repos from the last week and summarize what each one does, categorizing by language/domain |
| Gold/Silver Prices | 9am daily | Fetch silver/gold prices and correlate with recent news sentiment |

### More Ideas

- **Changelog Generator** - Summarize commits since last tag into a changelog entry
- **Test Coverage Check** - Run tests and report on coverage changes
- **Documentation Sync** - Find code changes that need documentation updates
- **Performance Scout** - Profile the app and suggest optimization opportunities
- **API Health Check** - Monitor external API status pages and summarize incidents

## Tech Stack

- [Bubble Tea](https://github.com/charmbracelet/bubbletea) - TUI framework
- [Bubbles](https://github.com/charmbracelet/bubbles) - TUI components (table, spinner, viewport, progress)
- [Lip Gloss](https://github.com/charmbracelet/lipgloss) - Styling
- [Glamour](https://github.com/charmbracelet/glamour) - Markdown rendering
- [robfig/cron](https://github.com/robfig/cron) - Cron scheduler
- [go-sqlite3](https://github.com/mattn/go-sqlite3) - SQLite driver

## License

MIT
