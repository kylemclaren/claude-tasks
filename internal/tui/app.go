package tui

import (
	"fmt"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/charmbracelet/bubbles/help"
	"github.com/charmbracelet/bubbles/key"
	"github.com/charmbracelet/bubbles/progress"
	"github.com/charmbracelet/bubbles/spinner"
	"github.com/charmbracelet/bubbles/table"
	"github.com/charmbracelet/bubbles/textinput"
	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/glamour"
	"github.com/charmbracelet/lipgloss"
	"github.com/kylemclaren/claude-tasks/internal/db"
	"github.com/kylemclaren/claude-tasks/internal/scheduler"
	"github.com/kylemclaren/claude-tasks/internal/usage"
)

// View represents the current view
type View int

const (
	ViewList View = iota
	ViewAdd
	ViewOutput
	ViewEdit
	ViewSettings
)

// KeyMap defines keybindings
type KeyMap struct {
	Up       key.Binding
	Down     key.Binding
	Add      key.Binding
	Edit     key.Binding
	Delete   key.Binding
	Toggle   key.Binding
	Run      key.Binding
	Enter    key.Binding
	Save     key.Binding
	Back     key.Binding
	Quit     key.Binding
	Refresh  key.Binding
	Tab      key.Binding
	Help     key.Binding
	Settings key.Binding
}

var keys = KeyMap{
	Up:       key.NewBinding(key.WithKeys("up", "k"), key.WithHelp("↑/k", "up")),
	Down:     key.NewBinding(key.WithKeys("down", "j"), key.WithHelp("↓/j", "down")),
	Add:      key.NewBinding(key.WithKeys("a"), key.WithHelp("a", "add")),
	Edit:     key.NewBinding(key.WithKeys("e"), key.WithHelp("e", "edit")),
	Delete:   key.NewBinding(key.WithKeys("d"), key.WithHelp("d", "delete")),
	Toggle:   key.NewBinding(key.WithKeys("t"), key.WithHelp("t", "toggle")),
	Run:      key.NewBinding(key.WithKeys("r"), key.WithHelp("r", "run now")),
	Enter:    key.NewBinding(key.WithKeys("enter"), key.WithHelp("enter", "view output")),
	Save:     key.NewBinding(key.WithKeys("ctrl+s"), key.WithHelp("ctrl+s", "save")),
	Back:     key.NewBinding(key.WithKeys("esc"), key.WithHelp("esc", "back")),
	Quit:     key.NewBinding(key.WithKeys("q", "ctrl+c"), key.WithHelp("q", "quit")),
	Refresh:  key.NewBinding(key.WithKeys("r"), key.WithHelp("r", "refresh")),
	Tab:      key.NewBinding(key.WithKeys("tab"), key.WithHelp("tab", "next field")),
	Help:     key.NewBinding(key.WithKeys("?"), key.WithHelp("?", "help")),
	Settings: key.NewBinding(key.WithKeys("s"), key.WithHelp("s", "settings")),
}

func (k KeyMap) ShortHelp() []key.Binding {
	return []key.Binding{k.Add, k.Edit, k.Delete, k.Toggle, k.Run, k.Settings, k.Quit}
}

func (k KeyMap) FullHelp() [][]key.Binding {
	return [][]key.Binding{
		{k.Up, k.Down, k.Enter},
		{k.Add, k.Edit, k.Delete},
		{k.Toggle, k.Run, k.Quit},
	}
}

// Model is the main TUI model
type Model struct {
	db        *db.DB
	scheduler *scheduler.Scheduler

	// View state
	currentView View
	width       int
	height      int

	// List view
	tasks        []*db.Task
	table        table.Model
	runningTasks map[int64]bool
	nextRuns     map[int64]time.Time

	// Spinners for running tasks
	spinner spinner.Model

	// Help
	help     help.Model
	showHelp bool

	// Add/Edit form
	formInputs  []textinput.Model
	formFocus   int
	editingTask *db.Task

	// Output view
	selectedTask *db.Task
	taskRuns     []*db.TaskRun
	viewport     viewport.Model
	mdRenderer   *glamour.TermRenderer

	// Usage tracking
	usageClient    *usage.Client
	usageData      *usage.Response
	usageThreshold float64
	usageErr       error

	// Settings view
	thresholdInput textinput.Model

	// Status
	statusMsg   string
	statusErr   bool
	statusTimer int
}

// Form field indices
const (
	fieldName = iota
	fieldPrompt
	fieldCron
	fieldWorkingDir
	fieldDiscordWebhook
	fieldCount
)

// NewModel creates a new TUI model
func NewModel(database *db.DB, sched *scheduler.Scheduler) Model {
	// Spinner
	s := spinner.New()
	s.Spinner = spinner.Dot
	s.Style = lipgloss.NewStyle().Foreground(warningColor)

	// Help
	h := help.New()
	h.Styles.ShortKey = helpKeyStyle
	h.Styles.ShortDesc = helpDescStyle

	// Table
	columns := []table.Column{
		{Title: "Name", Width: 20},
		{Title: "Schedule", Width: 20},
		{Title: "Status", Width: 12},
		{Title: "Next Run", Width: 20},
		{Title: "Last Run", Width: 20},
	}

	t := table.New(
		table.WithColumns(columns),
		table.WithFocused(true),
		table.WithHeight(7),
	)

	ts := table.DefaultStyles()
	ts.Header = ts.Header.
		BorderStyle(lipgloss.NormalBorder()).
		BorderForeground(dimTextColor).
		BorderBottom(true).
		Bold(true).
		Foreground(accentColor)
	ts.Selected = ts.Selected.
		Foreground(lipgloss.Color("#FFFFFF")).
		Background(primaryColor).
		Bold(true)
	t.SetStyles(ts)

	// Markdown renderer
	renderer, _ := glamour.NewTermRenderer(
		glamour.WithAutoStyle(),
		glamour.WithWordWrap(80),
	)

	// Usage client
	usageClient, _ := usage.NewClient()

	// Load threshold from DB
	threshold, _ := database.GetUsageThreshold()

	// Threshold input for settings
	thresholdInput := textinput.New()
	thresholdInput.Placeholder = "80"
	thresholdInput.CharLimit = 3
	thresholdInput.Width = 10
	thresholdInput.SetValue(fmt.Sprintf("%.0f", threshold))

	m := Model{
		db:             database,
		scheduler:      sched,
		spinner:        s,
		help:           h,
		table:          t,
		runningTasks:   make(map[int64]bool),
		nextRuns:       make(map[int64]time.Time),
		viewport:       viewport.New(80, 20),
		mdRenderer:     renderer,
		usageClient:    usageClient,
		usageThreshold: threshold,
		thresholdInput: thresholdInput,
	}

	m.initFormInputs()
	return m
}

func (m *Model) initFormInputs() {
	m.formInputs = make([]textinput.Model, fieldCount)

	m.formInputs[fieldName] = textinput.New()
	m.formInputs[fieldName].Placeholder = "Daily code review"
	m.formInputs[fieldName].CharLimit = 100
	m.formInputs[fieldName].Width = 50

	m.formInputs[fieldPrompt] = textinput.New()
	m.formInputs[fieldPrompt].Placeholder = "Review recent changes and summarize"
	m.formInputs[fieldPrompt].CharLimit = 2000
	m.formInputs[fieldPrompt].Width = 50

	m.formInputs[fieldCron] = textinput.New()
	m.formInputs[fieldCron].Placeholder = "0 * * * * * (every minute)"
	m.formInputs[fieldCron].CharLimit = 50
	m.formInputs[fieldCron].Width = 50

	m.formInputs[fieldWorkingDir] = textinput.New()
	m.formInputs[fieldWorkingDir].Placeholder = "/path/to/project"
	m.formInputs[fieldWorkingDir].CharLimit = 500
	m.formInputs[fieldWorkingDir].Width = 50
	wd, _ := os.Getwd()
	m.formInputs[fieldWorkingDir].SetValue(wd)

	m.formInputs[fieldDiscordWebhook] = textinput.New()
	m.formInputs[fieldDiscordWebhook].Placeholder = "https://discord.com/api/webhooks/..."
	m.formInputs[fieldDiscordWebhook].CharLimit = 500
	m.formInputs[fieldDiscordWebhook].Width = 50
}

func (m *Model) resetForm() {
	m.initFormInputs()
	m.formFocus = 0
	m.formInputs[0].Focus()
	m.editingTask = nil
}

func (m *Model) updateTable() {
	if len(m.tasks) == 0 {
		m.table.SetRows([]table.Row{})
		return
	}

	rows := make([]table.Row, len(m.tasks))
	for i, task := range m.tasks {
		status := "disabled"
		if m.runningTasks[task.ID] {
			status = "running"
		} else if task.Enabled {
			status = "enabled"
		}

		nextRun := "-"
		if next, ok := m.nextRuns[task.ID]; ok {
			nextRun = formatTime(next)
		}

		lastRun := "-"
		if task.LastRunAt != nil {
			lastRun = formatTime(*task.LastRunAt)
		}

		rows[i] = table.Row{
			truncate(task.Name, 18),
			truncate(task.CronExpr, 18),
			status,
			nextRun,
			lastRun,
		}
	}
	// Set height first, then rows
	h := len(m.tasks)
	if h < 5 {
		h = 5
	}
	if h > 15 {
		h = 15
	}
	m.table.SetHeight(h)
	m.table.SetRows(rows)
}

func formatTime(t time.Time) string {
	now := time.Now()
	if t.Before(now) {
		return t.Format("Jan 02 15:04")
	}

	diff := t.Sub(now)
	if diff < time.Minute {
		return fmt.Sprintf("in %ds", int(diff.Seconds()))
	}
	if diff < time.Hour {
		return fmt.Sprintf("in %dm", int(diff.Minutes()))
	}
	if diff < 24*time.Hour {
		return fmt.Sprintf("in %dh %dm", int(diff.Hours()), int(diff.Minutes())%60)
	}
	return t.Format("Jan 02 15:04")
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max-3] + "..."
}

// Messages
type tasksLoadedMsg struct{ tasks []*db.Task }
type taskCreatedMsg struct{ task *db.Task }
type taskDeletedMsg struct{ id int64 }
type taskToggledMsg struct{ id int64 }
type taskRunsLoadedMsg struct{ runs []*db.TaskRun }
type runningTasksMsg struct{ running map[int64]bool }
type usageUpdatedMsg struct {
	data *usage.Response
	err  error
}
type thresholdSavedMsg struct{ threshold float64 }
type errMsg struct{ err error }
type tickMsg time.Time

func (m Model) Init() tea.Cmd {
	return tea.Batch(
		m.loadTasks(),
		m.spinner.Tick,
		m.fetchUsage(),
		tickCmd(),
	)
}

func (m *Model) fetchUsage() tea.Cmd {
	return func() tea.Msg {
		if m.usageClient == nil {
			return usageUpdatedMsg{err: fmt.Errorf("no credentials")}
		}
		data, err := m.usageClient.Fetch()
		return usageUpdatedMsg{data: data, err: err}
	}
}

func tickCmd() tea.Cmd {
	return tea.Tick(time.Second, func(t time.Time) tea.Msg {
		return tickMsg(t)
	})
}

func (m *Model) loadTasks() tea.Cmd {
	return func() tea.Msg {
		tasks, err := m.db.ListTasks()
		if err != nil {
			return errMsg{err}
		}
		return tasksLoadedMsg{tasks}
	}
}

func (m *Model) checkRunningTasks() tea.Cmd {
	return func() tea.Msg {
		running := make(map[int64]bool)
		for _, task := range m.tasks {
			latestRun, err := m.db.GetLatestTaskRun(task.ID)
			if err == nil && latestRun.Status == db.RunStatusRunning {
				running[task.ID] = true
			}
		}
		return runningTasksMsg{running}
	}
}

func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmds []tea.Cmd

	switch msg := msg.(type) {
	case tea.KeyMsg:
		if msg.String() == "ctrl+c" {
			return m, tea.Quit
		}

		switch m.currentView {
		case ViewList:
			return m.updateList(msg)
		case ViewAdd, ViewEdit:
			return m.updateForm(msg)
		case ViewOutput:
			return m.updateOutput(msg)
		case ViewSettings:
			return m.updateSettings(msg)
		}

	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		m.table.SetWidth(msg.Width - 4)
		// Set reasonable table height
		h := msg.Height - 15
		if h < 5 {
			h = 5
		}
		if h > 20 {
			h = 20
		}
		m.table.SetHeight(h)
		m.viewport.Width = msg.Width - 6
		m.viewport.Height = msg.Height - 12
		m.help.Width = msg.Width
		// Update markdown renderer for new width
		if renderer, err := glamour.NewTermRenderer(
			glamour.WithAutoStyle(),
			glamour.WithWordWrap(msg.Width-10),
		); err == nil {
			m.mdRenderer = renderer
		}

	case spinner.TickMsg:
		var cmd tea.Cmd
		m.spinner, cmd = m.spinner.Update(msg)
		cmds = append(cmds, cmd)

	case tickMsg:
		m.nextRuns = m.scheduler.GetAllNextRunTimes()
		m.updateTable()

		// Decrement status timer
		if m.statusTimer > 0 {
			m.statusTimer--
			if m.statusTimer == 0 {
				m.statusMsg = ""
			}
		}

		cmds = append(cmds, tickCmd(), m.checkRunningTasks(), m.fetchUsage())

	case tasksLoadedMsg:
		m.tasks = msg.tasks
		m.nextRuns = m.scheduler.GetAllNextRunTimes()
		m.updateTable()
		cmds = append(cmds, m.checkRunningTasks())

	case runningTasksMsg:
		m.runningTasks = msg.running
		m.updateTable()

	case usageUpdatedMsg:
		if msg.err == nil {
			m.usageData = msg.data
			m.usageErr = nil
		} else {
			m.usageErr = msg.err
		}

	case thresholdSavedMsg:
		m.usageThreshold = msg.threshold
		m.setStatus(fmt.Sprintf("Threshold saved: %.0f%%", msg.threshold), false)
		m.currentView = ViewList

	case taskCreatedMsg:
		m.setStatus("Task saved: "+msg.task.Name, false)
		m.currentView = ViewList
		cmds = append(cmds, m.loadTasks())

	case taskDeletedMsg:
		m.setStatus("Task deleted", false)
		cmds = append(cmds, m.loadTasks())

	case taskToggledMsg:
		m.setStatus("Task toggled", false)
		cmds = append(cmds, m.loadTasks())

	case taskRunsLoadedMsg:
		m.taskRuns = msg.runs
		m.viewport.SetContent(m.renderOutputContent())
		m.viewport.GotoTop()

	case errMsg:
		m.setStatus("Error: "+msg.err.Error(), true)
	}

	return m, tea.Batch(cmds...)
}

func (m *Model) updateList(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	var cmd tea.Cmd

	switch msg.String() {
	case "q":
		return m, tea.Quit
	case "?":
		m.showHelp = !m.showHelp
		return m, nil
	case "a":
		m.currentView = ViewAdd
		m.resetForm()
		m.formInputs[0].Focus()
		return m, textinput.Blink
	case "d":
		if len(m.tasks) > 0 {
			idx := m.table.Cursor()
			if idx < len(m.tasks) {
				return m, m.deleteTask(m.tasks[idx].ID)
			}
		}
	case "t":
		if len(m.tasks) > 0 {
			idx := m.table.Cursor()
			if idx < len(m.tasks) {
				return m, m.toggleTask(m.tasks[idx].ID)
			}
		}
	case "r":
		if len(m.tasks) > 0 {
			idx := m.table.Cursor()
			if idx < len(m.tasks) {
				task := m.tasks[idx]
				if err := m.scheduler.RunTaskNow(task.ID); err != nil {
					m.setStatus("Error: "+err.Error(), true)
				} else {
					m.runningTasks[task.ID] = true
					m.updateTable()
					m.setStatus("Started: "+task.Name, false)
				}
			}
		}
		return m, nil
	case "enter":
		if len(m.tasks) > 0 {
			idx := m.table.Cursor()
			if idx < len(m.tasks) {
				m.selectedTask = m.tasks[idx]
				m.currentView = ViewOutput
				return m, m.loadTaskRuns(m.selectedTask.ID)
			}
		}
	case "e":
		if len(m.tasks) > 0 {
			idx := m.table.Cursor()
			if idx < len(m.tasks) {
				m.editingTask = m.tasks[idx]
				m.currentView = ViewEdit
				m.formInputs[fieldName].SetValue(m.editingTask.Name)
				m.formInputs[fieldPrompt].SetValue(m.editingTask.Prompt)
				m.formInputs[fieldCron].SetValue(m.editingTask.CronExpr)
				m.formInputs[fieldWorkingDir].SetValue(m.editingTask.WorkingDir)
				m.formInputs[fieldDiscordWebhook].SetValue(m.editingTask.DiscordWebhook)
				m.formFocus = 0
				m.formInputs[0].Focus()
				return m, textinput.Blink
			}
		}
	case "s":
		m.currentView = ViewSettings
		m.thresholdInput.SetValue(fmt.Sprintf("%.0f", m.usageThreshold))
		m.thresholdInput.Focus()
		return m, textinput.Blink
	default:
		// Only forward to table if we have rows
		if len(m.tasks) > 0 {
			m.table, cmd = m.table.Update(msg)
		}
	}

	return m, cmd
}

func (m *Model) updateForm(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	var cmd tea.Cmd

	switch msg.String() {
	case "esc":
		m.currentView = ViewList
		m.resetForm()
		return m, nil
	case "tab", "down":
		m.formInputs[m.formFocus].Blur()
		m.formFocus = (m.formFocus + 1) % fieldCount
		m.formInputs[m.formFocus].Focus()
		return m, textinput.Blink
	case "shift+tab", "up":
		m.formInputs[m.formFocus].Blur()
		m.formFocus--
		if m.formFocus < 0 {
			m.formFocus = fieldCount - 1
		}
		m.formInputs[m.formFocus].Focus()
		return m, textinput.Blink
	case "ctrl+s":
		return m, m.saveTask()
	case "enter":
		if m.formFocus == fieldCount-1 {
			return m, m.saveTask()
		}
		m.formInputs[m.formFocus].Blur()
		m.formFocus = (m.formFocus + 1) % fieldCount
		m.formInputs[m.formFocus].Focus()
		return m, textinput.Blink
	}

	m.formInputs[m.formFocus], cmd = m.formInputs[m.formFocus].Update(msg)
	return m, cmd
}

func (m *Model) updateOutput(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	var cmd tea.Cmd

	switch msg.String() {
	case "esc", "q":
		m.currentView = ViewList
		return m, nil
	case "r":
		return m, m.loadTaskRuns(m.selectedTask.ID)
	}

	m.viewport, cmd = m.viewport.Update(msg)
	return m, cmd
}

func (m *Model) updateSettings(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	var cmd tea.Cmd

	switch msg.String() {
	case "esc":
		m.currentView = ViewList
		return m, nil
	case "enter", "ctrl+s":
		return m, m.saveThreshold()
	}

	m.thresholdInput, cmd = m.thresholdInput.Update(msg)
	return m, cmd
}

func (m *Model) saveThreshold() tea.Cmd {
	return func() tea.Msg {
		val := strings.TrimSpace(m.thresholdInput.Value())
		var threshold float64
		if _, err := fmt.Sscanf(val, "%f", &threshold); err != nil {
			return errMsg{fmt.Errorf("invalid threshold value")}
		}
		if threshold < 0 || threshold > 100 {
			return errMsg{fmt.Errorf("threshold must be between 0 and 100")}
		}
		if err := m.db.SetUsageThreshold(threshold); err != nil {
			return errMsg{err}
		}
		return thresholdSavedMsg{threshold: threshold}
	}
}

func (m *Model) saveTask() tea.Cmd {
	return func() tea.Msg {
		name := strings.TrimSpace(m.formInputs[fieldName].Value())
		prompt := strings.TrimSpace(m.formInputs[fieldPrompt].Value())
		cronExpr := strings.TrimSpace(m.formInputs[fieldCron].Value())
		workingDir := strings.TrimSpace(m.formInputs[fieldWorkingDir].Value())
		discordWebhook := strings.TrimSpace(m.formInputs[fieldDiscordWebhook].Value())

		if name == "" || prompt == "" || cronExpr == "" {
			return errMsg{fmt.Errorf("name, prompt, and cron are required")}
		}

		if workingDir == "" {
			workingDir = "."
		}

		task := &db.Task{
			Name:           name,
			Prompt:         prompt,
			CronExpr:       cronExpr,
			WorkingDir:     workingDir,
			DiscordWebhook: discordWebhook,
			Enabled:        true,
		}

		if m.editingTask != nil {
			task.ID = m.editingTask.ID
			task.CreatedAt = m.editingTask.CreatedAt
			task.Enabled = m.editingTask.Enabled
			if err := m.db.UpdateTask(task); err != nil {
				return errMsg{err}
			}
			_ = m.scheduler.UpdateTask(task)
		} else {
			if err := m.db.CreateTask(task); err != nil {
				return errMsg{err}
			}
			_ = m.scheduler.AddTask(task)
		}

		return taskCreatedMsg{task}
	}
}

func (m *Model) deleteTask(id int64) tea.Cmd {
	return func() tea.Msg {
		m.scheduler.RemoveTask(id)
		if err := m.db.DeleteTask(id); err != nil {
			return errMsg{err}
		}
		return taskDeletedMsg{id}
	}
}

func (m *Model) toggleTask(id int64) tea.Cmd {
	return func() tea.Msg {
		if err := m.db.ToggleTask(id); err != nil {
			return errMsg{err}
		}
		task, _ := m.db.GetTask(id)
		if task != nil {
			_ = m.scheduler.UpdateTask(task)
		}
		return taskToggledMsg{id}
	}
}

func (m *Model) loadTaskRuns(taskID int64) tea.Cmd {
	return func() tea.Msg {
		runs, err := m.db.GetTaskRuns(taskID, 20)
		if err != nil {
			return errMsg{err}
		}
		return taskRunsLoadedMsg{runs}
	}
}

func (m *Model) setStatus(msg string, isErr bool) {
	m.statusMsg = msg
	m.statusErr = isErr
	m.statusTimer = 5 // 5 seconds
}

func (m Model) View() string {
	var content string

	switch m.currentView {
	case ViewList:
		content = m.renderList()
	case ViewAdd:
		content = m.renderForm("Add New Task")
	case ViewEdit:
		content = m.renderForm("Edit Task")
	case ViewOutput:
		content = m.renderOutput()
	case ViewSettings:
		content = m.renderSettings()
	}

	return appStyle.Render(content)
}

func (m Model) renderList() string {
	var b strings.Builder

	// Header with usage status
	title := logoStyle.Render("◆ Claude Tasks")
	b.WriteString(title)

	// Usage status bar
	if m.usageData != nil {
		b.WriteString("  ")
		b.WriteString(m.renderUsageBar())
	}
	b.WriteString("\n\n")

	// Show running indicator if any tasks are running
	hasRunning := len(m.runningTasks) > 0
	if hasRunning {
		b.WriteString(m.spinner.View())
		b.WriteString(" ")
		b.WriteString(statusRunning.Render(fmt.Sprintf("%d task(s) running", len(m.runningTasks))))
		b.WriteString("\n\n")
	}

	// Table or empty state
	if len(m.tasks) == 0 {
		empty := emptyBoxStyle.Render("No tasks yet\n\nPress 'a' to add your first task")
		b.WriteString(empty)
	} else {
		b.WriteString(m.table.View())
	}

	b.WriteString("\n")

	// Status message
	if m.statusMsg != "" {
		if m.statusErr {
			b.WriteString(errorMsgStyle.Render("✗ " + m.statusMsg))
		} else {
			b.WriteString(successMsgStyle.Render("✓ " + m.statusMsg))
		}
		b.WriteString("\n")
	}

	// Help
	b.WriteString("\n")
	if m.showHelp {
		b.WriteString(m.help.FullHelpView(keys.FullHelp()))
	} else {
		b.WriteString(m.help.ShortHelpView(keys.ShortHelp()))
	}

	return b.String()
}

func (m Model) renderUsageBar() string {
	if m.usageData == nil {
		return subtitleStyle.Render("(loading usage...)")
	}

	fiveHour := m.usageData.FiveHour.Utilization
	sevenDay := m.usageData.SevenDay.Utilization

	// Create progress bars with color gradient
	fiveHourBar := m.createUsageProgress(fiveHour)
	sevenDayBar := m.createUsageProgress(sevenDay)

	// Format percentages with colors
	fiveHourPct := m.formatUsagePct(fiveHour)
	sevenDayPct := m.formatUsagePct(sevenDay)

	// Time until reset
	resetTime := m.usageData.FormatTimeUntilReset()

	// Threshold indicator
	thresholdStr := fmt.Sprintf("%.0f%%", m.usageThreshold)
	var thresholdStyle lipgloss.Style
	if fiveHour >= m.usageThreshold || sevenDay >= m.usageThreshold {
		thresholdStyle = statusFail
	} else {
		thresholdStyle = subtitleStyle
	}

	return fmt.Sprintf("5h %s %s │ 7d %s %s │ ⏱ %s │ ⚡ %s",
		fiveHourBar, fiveHourPct,
		sevenDayBar, sevenDayPct,
		resetTime,
		thresholdStyle.Render(thresholdStr))
}

func (m Model) createUsageProgress(pct float64) string {
	if pct > 100 {
		pct = 100
	}
	if pct < 0 {
		pct = 0
	}

	// Create color gradient from green to red
	endColor := m.getGradientColor(pct)
	prog := progress.New(
		progress.WithGradient("#00ff00", endColor),
		progress.WithWidth(10),
		progress.WithoutPercentage(),
	)

	return prog.ViewAs(pct / 100)
}

func (m Model) getGradientColor(pct float64) string {
	t := pct / 100
	r := int(255 * t)
	g := int(255 * (1 - t))
	return fmt.Sprintf("#%02x%02x00", r, g)
}

func (m Model) formatUsagePct(pct float64) string {
	var style lipgloss.Style
	if pct < 70 {
		style = statusOK
	} else if pct < 90 {
		style = statusRunning
	} else {
		style = statusFail
	}
	return style.Render(fmt.Sprintf("%d%%", int(pct)))
}

func (m Model) renderSettings() string {
	var b strings.Builder

	b.WriteString(logoStyle.Render("◆ Settings"))
	b.WriteString("\n\n")

	// Current usage display
	if m.usageData != nil {
		b.WriteString(inputLabelStyle.Render("Current Usage"))
		b.WriteString("\n")
		b.WriteString(fmt.Sprintf("  5-hour:  %s\n", m.formatUsagePct(m.usageData.FiveHour.Utilization)))
		b.WriteString(fmt.Sprintf("  7-day:   %s\n", m.formatUsagePct(m.usageData.SevenDay.Utilization)))
		b.WriteString(fmt.Sprintf("  Resets:  %s\n", m.usageData.FormatTimeUntilReset()))
		b.WriteString("\n")
	}

	// Threshold input
	b.WriteString(inputLabelStyle.Render("Usage Threshold (%)"))
	b.WriteString("  ")
	b.WriteString(subtitleStyle.Render("Tasks skip when usage exceeds this"))
	b.WriteString("\n")
	b.WriteString(focusedInputStyle.Render(m.thresholdInput.View()))
	b.WriteString("\n\n")

	// Help text
	helpText := helpKeyStyle.Render("enter") + helpDescStyle.Render(" save • ") +
		helpKeyStyle.Render("esc") + helpDescStyle.Render(" cancel")
	b.WriteString(helpText)

	return b.String()
}

func (m Model) renderForm(title string) string {
	var b strings.Builder

	b.WriteString(logoStyle.Render("◆ " + title))
	b.WriteString("\n\n")

	labels := []string{"Name", "Prompt", "Cron Expression", "Working Directory", "Discord Webhook (optional)"}
	hints := []string{
		"",
		"",
		"Format: sec min hour day month weekday",
		"",
		"",
	}

	for i, label := range labels {
		b.WriteString(inputLabelStyle.Render(label))
		if hints[i] != "" {
			b.WriteString("  ")
			b.WriteString(subtitleStyle.Render(hints[i]))
		}
		b.WriteString("\n")

		if i == m.formFocus {
			b.WriteString(focusedInputStyle.Render(m.formInputs[i].View()))
		} else {
			b.WriteString(blurredInputStyle.Render(m.formInputs[i].View()))
		}
		b.WriteString("\n\n")
	}

	// Status
	if m.statusMsg != "" {
		if m.statusErr {
			b.WriteString(errorMsgStyle.Render("✗ " + m.statusMsg))
		}
		b.WriteString("\n")
	}

	// Help
	helpText := helpKeyStyle.Render("tab") + helpDescStyle.Render(" next • ") +
		helpKeyStyle.Render("ctrl+s") + helpDescStyle.Render(" save • ") +
		helpKeyStyle.Render("esc") + helpDescStyle.Render(" cancel")
	b.WriteString("\n")
	b.WriteString(helpText)

	// Cron examples
	b.WriteString("\n\n")
	b.WriteString(subtitleStyle.Render("Examples: "))
	b.WriteString(dimRowStyle.Render("0 * * * * * (every min) • 0 0 9 * * * (9am daily) • 0 0 */2 * * * (every 2h)"))

	return b.String()
}

func (m Model) renderOutput() string {
	var b strings.Builder

	title := fmt.Sprintf("◆ %s", m.selectedTask.Name)
	b.WriteString(logoStyle.Render(title))
	b.WriteString("\n")
	b.WriteString(subtitleStyle.Render(m.selectedTask.Prompt))
	b.WriteString("\n\n")

	b.WriteString(m.viewport.View())
	b.WriteString("\n\n")

	// Help
	helpText := helpKeyStyle.Render("↑/↓") + helpDescStyle.Render(" scroll • ") +
		helpKeyStyle.Render("r") + helpDescStyle.Render(" refresh • ") +
		helpKeyStyle.Render("esc") + helpDescStyle.Render(" back")
	b.WriteString(helpText)

	return b.String()
}

func (m Model) renderOutputContent() string {
	if len(m.taskRuns) == 0 {
		return emptyBoxStyle.Render("No runs yet for this task")
	}

	// Sort runs: running first, then by start time descending
	runs := make([]*db.TaskRun, len(m.taskRuns))
	copy(runs, m.taskRuns)
	sort.Slice(runs, func(i, j int) bool {
		// Running tasks first
		if runs[i].Status == db.RunStatusRunning && runs[j].Status != db.RunStatusRunning {
			return true
		}
		if runs[j].Status == db.RunStatusRunning && runs[i].Status != db.RunStatusRunning {
			return false
		}
		// Then by start time descending
		return runs[i].StartedAt.After(runs[j].StartedAt)
	})

	var b strings.Builder

	for i, run := range runs {
		// Status icon and time
		var statusIcon string
		switch run.Status {
		case db.RunStatusCompleted:
			statusIcon = statusOK.Render("✓ COMPLETED")
		case db.RunStatusFailed:
			statusIcon = statusFail.Render("✗ FAILED")
		case db.RunStatusRunning:
			statusIcon = statusRunning.Render("● RUNNING")
		default:
			statusIcon = statusPending.Render("○ PENDING")
		}

		duration := "..."
		if run.EndedAt != nil {
			duration = run.EndedAt.Sub(run.StartedAt).Round(time.Millisecond).String()
		}

		header := fmt.Sprintf("%s  %s  (%s)",
			statusIcon,
			run.StartedAt.Format("2006-01-02 15:04:05"),
			duration)
		b.WriteString(header)
		b.WriteString("\n")
		b.WriteString(dividerStyle.Render(strings.Repeat("─", 60)))
		b.WriteString("\n")

		if run.Output != "" {
			// Render markdown
			if m.mdRenderer != nil {
				rendered, err := m.mdRenderer.Render(run.Output)
				if err == nil {
					b.WriteString(rendered)
				} else {
					b.WriteString(run.Output)
					b.WriteString("\n")
				}
			} else {
				b.WriteString(run.Output)
				b.WriteString("\n")
			}
		}

		if run.Error != "" {
			b.WriteString(statusFail.Render("Error: "))
			b.WriteString(run.Error)
			b.WriteString("\n")
		}

		if i < len(runs)-1 {
			b.WriteString("\n")
		}
	}

	return b.String()
}

// Run starts the TUI application
func Run(database *db.DB, sched *scheduler.Scheduler) error {
	m := NewModel(database, sched)
	p := tea.NewProgram(m, tea.WithAltScreen())
	_, err := p.Run()
	return err
}
