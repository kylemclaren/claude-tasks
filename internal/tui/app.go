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
	"github.com/charmbracelet/bubbles/textarea"
	"github.com/charmbracelet/bubbles/textinput"
	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/glamour"
	"github.com/charmbracelet/lipgloss"
	"github.com/kylemclaren/claude-tasks/internal/db"
	"github.com/kylemclaren/claude-tasks/internal/scheduler"
	"github.com/kylemclaren/claude-tasks/internal/usage"
	"github.com/robfig/cron/v3"
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
	tasks           []*db.Task
	table           table.Model
	runningTasks    map[int64]bool
	nextRuns        map[int64]time.Time
	lastRunStatuses map[int64]db.RunStatus // Track last run status for each task

	// Delete confirmation
	confirmDelete      bool
	deleteTaskID       int64
	deleteTaskName     string
	deleteConfirmFocus int // 0 = Yes, 1 = No

	// Search/filter
	searchMode    bool
	searchInput   textinput.Model
	filteredTasks []*db.Task

	// Spinners for running tasks
	spinner spinner.Model

	// Help
	help     help.Model
	showHelp bool

	// Add/Edit form
	formInputs     []textinput.Model
	promptInput    textarea.Model
	formFocus      int
	editingTask    *db.Task
	formValidation map[int]string // Validation errors per field

	// Cron helper
	showCronHelper    bool
	cronHelperIndex   int
	cronPresets       []cronPreset

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

// cronPreset represents a cron schedule preset
type cronPreset struct {
	name string
	expr string
	desc string
}

// Form field indices
const (
	fieldName = iota
	fieldPrompt
	fieldCron
	fieldWorkingDir
	fieldDiscordWebhook
	fieldSlackWebhook
	fieldCount
)

// Layout constants
const (
	minWidth        = 60
	maxTableWidth   = 160
	headerHeight    = 4  // Logo + spacing
	footerHeight    = 4  // Help + status
	minTableHeight  = 5
	formHeaderHeight = 4
	formFooterHeight = 6
	outputHeaderHeight = 5
	outputFooterHeight = 3
)

// calculateTableColumns returns column definitions sized for the given width
func calculateTableColumns(width int) []table.Column {
	// Account for table borders and padding
	availableWidth := width - 4
	if availableWidth < minWidth {
		availableWidth = minWidth
	}
	if availableWidth > maxTableWidth {
		availableWidth = maxTableWidth
	}

	// Column proportions (percentages): Name 25%, Schedule 20%, Status 12%, Next 20%, Last 20%
	// Status is fixed width since it's short text
	statusWidth := 10
	remaining := availableWidth - statusWidth - 8 // 8 for column separators

	nameWidth := remaining * 25 / 85
	scheduleWidth := remaining * 20 / 85
	nextWidth := remaining * 20 / 85
	lastWidth := remaining * 20 / 85

	// Ensure minimum widths
	if nameWidth < 12 {
		nameWidth = 12
	}
	if scheduleWidth < 15 {
		scheduleWidth = 15
	}
	if nextWidth < 14 {
		nextWidth = 14
	}
	if lastWidth < 14 {
		lastWidth = 14
	}

	return []table.Column{
		{Title: "Name", Width: nameWidth},
		{Title: "Schedule", Width: scheduleWidth},
		{Title: "Status", Width: statusWidth},
		{Title: "Next Run", Width: nextWidth},
		{Title: "Last Run", Width: lastWidth},
	}
}

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

	// Table - start with reasonable default, will resize on WindowSizeMsg
	columns := calculateTableColumns(100)

	t := table.New(
		table.WithColumns(columns),
		table.WithFocused(true),
		table.WithHeight(10),
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

	// Search input
	searchInput := textinput.New()
	searchInput.Placeholder = "Search tasks..."
	searchInput.CharLimit = 100
	searchInput.Width = 30

	// Cron presets
	cronPresets := []cronPreset{
		{name: "Every minute", expr: "0 * * * * *", desc: "Runs at the start of every minute"},
		{name: "Every 5 minutes", expr: "0 */5 * * * *", desc: "Runs every 5 minutes"},
		{name: "Every 15 minutes", expr: "0 */15 * * * *", desc: "Runs every 15 minutes"},
		{name: "Every hour", expr: "0 0 * * * *", desc: "Runs at the start of every hour"},
		{name: "Every 2 hours", expr: "0 0 */2 * * *", desc: "Runs every 2 hours"},
		{name: "Daily at 9am", expr: "0 0 9 * * *", desc: "Runs once daily at 9:00 AM"},
		{name: "Daily at midnight", expr: "0 0 0 * * *", desc: "Runs once daily at midnight"},
		{name: "Weekly on Monday", expr: "0 0 9 * * 1", desc: "Runs every Monday at 9:00 AM"},
		{name: "Monthly on 1st", expr: "0 0 9 1 * *", desc: "Runs on the 1st of each month at 9:00 AM"},
	}

	m := Model{
		db:              database,
		scheduler:       sched,
		spinner:         s,
		help:            h,
		table:           t,
		runningTasks:    make(map[int64]bool),
		nextRuns:        make(map[int64]time.Time),
		lastRunStatuses: make(map[int64]db.RunStatus),
		searchInput:     searchInput,
		cronPresets:     cronPresets,
		formValidation:  make(map[int]string),
		viewport:        viewport.New(80, 20),
		mdRenderer:      renderer,
		usageClient:     usageClient,
		usageThreshold:  threshold,
		thresholdInput:  thresholdInput,
	}

	m.initFormInputs()
	return m
}

func (m *Model) initFormInputs() {
	m.formInputs = make([]textinput.Model, fieldCount)

	// Calculate responsive width (will be updated on WindowSizeMsg)
	inputWidth := m.getFormInputWidth()

	m.formInputs[fieldName] = textinput.New()
	m.formInputs[fieldName].Placeholder = "Daily code review"
	m.formInputs[fieldName].CharLimit = 100
	m.formInputs[fieldName].Width = inputWidth

	// Prompt uses textarea for multi-line input
	m.promptInput = textarea.New()
	m.promptInput.Placeholder = "Review recent changes and summarize..."
	m.promptInput.CharLimit = 2000
	m.promptInput.SetWidth(inputWidth + 2)
	m.promptInput.SetHeight(m.getTextareaHeight())
	m.promptInput.ShowLineNumbers = false

	m.formInputs[fieldCron] = textinput.New()
	m.formInputs[fieldCron].Placeholder = "0 * * * * * (every minute)"
	m.formInputs[fieldCron].CharLimit = 50
	m.formInputs[fieldCron].Width = inputWidth

	m.formInputs[fieldWorkingDir] = textinput.New()
	m.formInputs[fieldWorkingDir].Placeholder = "/path/to/project"
	m.formInputs[fieldWorkingDir].CharLimit = 500
	m.formInputs[fieldWorkingDir].Width = inputWidth
	wd, _ := os.Getwd()
	m.formInputs[fieldWorkingDir].SetValue(wd)

	m.formInputs[fieldDiscordWebhook] = textinput.New()
	m.formInputs[fieldDiscordWebhook].Placeholder = "https://discord.com/api/webhooks/..."
	m.formInputs[fieldDiscordWebhook].CharLimit = 500
	m.formInputs[fieldDiscordWebhook].Width = inputWidth

	m.formInputs[fieldSlackWebhook] = textinput.New()
	m.formInputs[fieldSlackWebhook].Placeholder = "https://hooks.slack.com/services/..."
	m.formInputs[fieldSlackWebhook].CharLimit = 500
	m.formInputs[fieldSlackWebhook].Width = inputWidth
}

// getFormInputWidth calculates responsive input width
func (m *Model) getFormInputWidth() int {
	if m.width == 0 {
		return 50 // default before first WindowSizeMsg
	}
	// Use ~80% of available width, with min/max bounds
	width := (m.width - 8) * 80 / 100
	if width < 40 {
		width = 40
	}
	if width > 100 {
		width = 100
	}
	return width
}

// getTextareaHeight calculates responsive textarea height
func (m *Model) getTextareaHeight() int {
	if m.height == 0 {
		return 6 // default before first WindowSizeMsg
	}
	// Calculate available height for form
	// Each field takes ~3 lines (label + input + spacing)
	otherFieldsHeight := 4 * 3 // 4 other fields
	availableForTextarea := m.height - formHeaderHeight - formFooterHeight - otherFieldsHeight - 4
	if availableForTextarea < 4 {
		availableForTextarea = 4
	}
	if availableForTextarea > 12 {
		availableForTextarea = 12
	}
	return availableForTextarea
}

// updateFormWidths updates all form input widths for new terminal size
func (m *Model) updateFormWidths(width int) {
	inputWidth := m.getFormInputWidth()

	for i := range m.formInputs {
		m.formInputs[i].Width = inputWidth
	}
	m.promptInput.SetWidth(inputWidth + 2)
	m.promptInput.SetHeight(m.getTextareaHeight())
}

func (m *Model) resetForm() {
	m.initFormInputs()
	m.formFocus = 0
	m.formInputs[fieldName].Focus()
	m.editingTask = nil
}

func (m *Model) focusFormField(field int) {
	// Blur all fields first
	for i := range m.formInputs {
		m.formInputs[i].Blur()
	}
	m.promptInput.Blur()

	// Focus the target field
	m.formFocus = field
	if field == fieldPrompt {
		m.promptInput.Focus()
	} else {
		m.formInputs[field].Focus()
	}
}

func (m *Model) updateTable() {
	// Use filtered tasks if in search mode, otherwise all tasks
	tasksToShow := m.tasks
	if m.searchMode && len(m.filteredTasks) > 0 {
		tasksToShow = m.filteredTasks
	} else if m.searchMode && m.searchInput.Value() != "" {
		tasksToShow = m.filteredTasks // Show empty if search has no matches
	}

	if len(tasksToShow) == 0 {
		m.table.SetRows([]table.Row{})
		return
	}

	// Get current column widths for truncation
	columns := m.table.Columns()
	nameWidth := 18
	scheduleWidth := 18
	if len(columns) >= 2 {
		nameWidth = columns[0].Width - 2     // leave room for ellipsis
		scheduleWidth = columns[1].Width - 2
	}

	rows := make([]table.Row, len(tasksToShow))
	for i, task := range tasksToShow {
		// Build status with last run indicator
		var statusParts []string

		// Last run status indicator
		if lastStatus, ok := m.lastRunStatuses[task.ID]; ok {
			switch lastStatus {
			case db.RunStatusCompleted:
				statusParts = append(statusParts, "✓")
			case db.RunStatusFailed:
				statusParts = append(statusParts, "✗")
			case db.RunStatusRunning:
				statusParts = append(statusParts, "●")
			}
		}

		// Current task status
		if m.runningTasks[task.ID] {
			statusParts = append(statusParts, "running")
		} else if task.Enabled {
			statusParts = append(statusParts, "enabled")
		} else {
			statusParts = append(statusParts, "disabled")
		}

		status := strings.Join(statusParts, " ")

		nextRun := "-"
		if next, ok := m.nextRuns[task.ID]; ok {
			nextRun = formatTime(next)
		}

		lastRun := "-"
		if task.LastRunAt != nil {
			lastRun = formatTime(*task.LastRunAt)
		}

		rows[i] = table.Row{
			truncate(task.Name, nameWidth),
			truncate(task.CronExpr, scheduleWidth),
			status,
			nextRun,
			lastRun,
		}
	}
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
type taskToggledMsg struct {
	id      int64
	enabled bool
}
type taskRunsLoadedMsg struct{ runs []*db.TaskRun }
type runningTasksMsg struct{ running map[int64]bool }
type usageUpdatedMsg struct {
	data *usage.Response
	err  error
}
type thresholdSavedMsg struct{ threshold float64 }
type lastRunStatusesMsg struct{ statuses map[int64]db.RunStatus }
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

func (m *Model) fetchLastRunStatuses() tea.Cmd {
	return func() tea.Msg {
		statuses, err := m.db.GetLastRunStatuses()
		if err != nil {
			return lastRunStatusesMsg{statuses: make(map[int64]db.RunStatus)}
		}
		return lastRunStatusesMsg{statuses: statuses}
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

		// Update table columns and dimensions
		m.table.SetColumns(calculateTableColumns(msg.Width))
		tableWidth := msg.Width - 4
		if tableWidth > maxTableWidth {
			tableWidth = maxTableWidth
		}
		m.table.SetWidth(tableWidth)

		// Calculate table height based on available space
		// Account for header, running indicator (2 lines if shown), status, and help
		runningIndicatorHeight := 0
		if len(m.runningTasks) > 0 {
			runningIndicatorHeight = 2
		}
		availableHeight := msg.Height - headerHeight - footerHeight - runningIndicatorHeight - 2 // 2 for app padding
		if availableHeight < minTableHeight {
			availableHeight = minTableHeight
		}
		m.table.SetHeight(availableHeight)

		// Update viewport for output view
		viewportHeight := msg.Height - outputHeaderHeight - outputFooterHeight - 2
		if viewportHeight < 5 {
			viewportHeight = 5
		}
		m.viewport.Width = msg.Width - 6
		m.viewport.Height = viewportHeight

		m.help.Width = msg.Width

		// Update form input widths
		m.updateFormWidths(msg.Width)

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

		cmds = append(cmds, tickCmd(), m.checkRunningTasks(), m.fetchUsage(), m.fetchLastRunStatuses())

	case tasksLoadedMsg:
		m.tasks = msg.tasks
		m.nextRuns = m.scheduler.GetAllNextRunTimes()
		m.updateTable()
		cmds = append(cmds, m.checkRunningTasks())

	case runningTasksMsg:
		m.runningTasks = msg.running
		m.updateTable()

	case lastRunStatusesMsg:
		m.lastRunStatuses = msg.statuses
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
		if msg.enabled {
			m.setStatus("Task enabled", false)
		} else {
			m.setStatus("Task disabled", false)
		}
		// Update selectedTask if we're in output view
		if m.selectedTask != nil && m.selectedTask.ID == msg.id {
			m.selectedTask.Enabled = msg.enabled
		}
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

	// Handle delete confirmation mode
	if m.confirmDelete {
		switch msg.String() {
		case "left", "h":
			m.deleteConfirmFocus = 0 // Yes
			return m, nil
		case "right", "l":
			m.deleteConfirmFocus = 1 // No
			return m, nil
		case "tab":
			m.deleteConfirmFocus = (m.deleteConfirmFocus + 1) % 2
			return m, nil
		case "y", "Y":
			m.confirmDelete = false
			taskID := m.deleteTaskID
			m.deleteTaskID = 0
			m.deleteTaskName = ""
			m.deleteConfirmFocus = 1
			return m, m.deleteTask(taskID)
		case "enter":
			if m.deleteConfirmFocus == 0 {
				// Yes selected - delete
				m.confirmDelete = false
				taskID := m.deleteTaskID
				m.deleteTaskID = 0
				m.deleteTaskName = ""
				m.deleteConfirmFocus = 1
				return m, m.deleteTask(taskID)
			}
			// No selected - cancel
			m.confirmDelete = false
			m.deleteTaskID = 0
			m.deleteTaskName = ""
			m.deleteConfirmFocus = 1
			return m, nil
		case "n", "N", "esc":
			m.confirmDelete = false
			m.deleteTaskID = 0
			m.deleteTaskName = ""
			m.deleteConfirmFocus = 1
			return m, nil
		}
		return m, nil
	}

	// Handle search mode
	if m.searchMode {
		switch msg.String() {
		case "esc":
			m.searchMode = false
			m.searchInput.SetValue("")
			m.searchInput.Blur()
			m.filteredTasks = nil
			m.updateTable()
			return m, nil
		case "enter":
			// Exit search mode but keep filter
			m.searchInput.Blur()
			return m, nil
		default:
			m.searchInput, cmd = m.searchInput.Update(msg)
			// Update filtered tasks based on search
			m.filterTasks()
			m.updateTable()
			return m, cmd
		}
	}

	switch msg.String() {
	case "q":
		return m, tea.Quit
	case "?":
		m.showHelp = !m.showHelp
		return m, nil
	case "/":
		// Enter search mode
		m.searchMode = true
		m.searchInput.Focus()
		return m, textinput.Blink
	case "a":
		m.currentView = ViewAdd
		m.resetForm()
		m.formInputs[0].Focus()
		return m, textinput.Blink
	case "d":
		tasksToUse := m.getDisplayTasks()
		if len(tasksToUse) > 0 {
			idx := m.table.Cursor()
			if idx < len(tasksToUse) {
				// Show confirmation instead of deleting immediately
				m.confirmDelete = true
				m.deleteTaskID = tasksToUse[idx].ID
				m.deleteTaskName = tasksToUse[idx].Name
				m.deleteConfirmFocus = 1 // Default to "No" for safety
				return m, nil
			}
		}
	case "t":
		tasksToUse := m.getDisplayTasks()
		if len(tasksToUse) > 0 {
			idx := m.table.Cursor()
			if idx < len(tasksToUse) {
				return m, m.toggleTask(tasksToUse[idx].ID)
			}
		}
	case "r":
		tasksToUse := m.getDisplayTasks()
		if len(tasksToUse) > 0 {
			idx := m.table.Cursor()
			if idx < len(tasksToUse) {
				task := tasksToUse[idx]
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
		tasksToUse := m.getDisplayTasks()
		if len(tasksToUse) > 0 {
			idx := m.table.Cursor()
			if idx < len(tasksToUse) {
				m.selectedTask = tasksToUse[idx]
				m.currentView = ViewOutput
				return m, m.loadTaskRuns(m.selectedTask.ID)
			}
		}
	case "e":
		tasksToUse := m.getDisplayTasks()
		if len(tasksToUse) > 0 {
			idx := m.table.Cursor()
			if idx < len(tasksToUse) {
				m.editingTask = tasksToUse[idx]
				m.currentView = ViewEdit
				m.initFormInputs() // Reset form first
				m.formInputs[fieldName].SetValue(m.editingTask.Name)
				m.promptInput.SetValue(m.editingTask.Prompt)
				m.formInputs[fieldCron].SetValue(m.editingTask.CronExpr)
				m.formInputs[fieldWorkingDir].SetValue(m.editingTask.WorkingDir)
				m.formInputs[fieldDiscordWebhook].SetValue(m.editingTask.DiscordWebhook)
				m.formInputs[fieldSlackWebhook].SetValue(m.editingTask.SlackWebhook)
				m.focusFormField(fieldName)
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
		tasksToUse := m.getDisplayTasks()
		if len(tasksToUse) > 0 {
			m.table, cmd = m.table.Update(msg)
		}
	}

	return m, cmd
}

// getDisplayTasks returns the tasks currently being displayed (filtered or all)
func (m *Model) getDisplayTasks() []*db.Task {
	if m.searchMode && m.searchInput.Value() != "" {
		return m.filteredTasks
	}
	return m.tasks
}

// filterTasks filters tasks based on search input
func (m *Model) filterTasks() {
	query := strings.ToLower(strings.TrimSpace(m.searchInput.Value()))
	if query == "" {
		m.filteredTasks = m.tasks
		return
	}

	m.filteredTasks = nil
	for _, task := range m.tasks {
		if strings.Contains(strings.ToLower(task.Name), query) ||
			strings.Contains(strings.ToLower(task.Prompt), query) {
			m.filteredTasks = append(m.filteredTasks, task)
		}
	}
}

// validateForm validates all form fields and returns true if valid
func (m *Model) validateForm() bool {
	m.formValidation = make(map[int]string)
	valid := true

	// Validate name
	name := strings.TrimSpace(m.formInputs[fieldName].Value())
	if name == "" {
		m.formValidation[fieldName] = "Name is required"
		valid = false
	}

	// Validate prompt
	prompt := strings.TrimSpace(m.promptInput.Value())
	if prompt == "" {
		m.formValidation[fieldPrompt] = "Prompt is required"
		valid = false
	}

	// Validate cron expression
	cronExpr := strings.TrimSpace(m.formInputs[fieldCron].Value())
	if cronExpr == "" {
		m.formValidation[fieldCron] = "Cron expression is required"
		valid = false
	} else {
		// Use cron parser with seconds support
		parser := cron.NewParser(cron.Second | cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow)
		if _, err := parser.Parse(cronExpr); err != nil {
			m.formValidation[fieldCron] = "Invalid cron format"
			valid = false
		}
	}

	// Validate working directory (if provided)
	workDir := strings.TrimSpace(m.formInputs[fieldWorkingDir].Value())
	if workDir != "" && workDir != "." {
		if info, err := os.Stat(workDir); err != nil || !info.IsDir() {
			m.formValidation[fieldWorkingDir] = "Directory not found"
			valid = false
		}
	}

	return valid
}

func (m *Model) updateForm(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	var cmd tea.Cmd

	// Handle cron helper mode
	if m.showCronHelper {
		switch msg.String() {
		case "up", "k":
			if m.cronHelperIndex > 0 {
				m.cronHelperIndex--
			}
			return m, nil
		case "down", "j":
			if m.cronHelperIndex < len(m.cronPresets)-1 {
				m.cronHelperIndex++
			}
			return m, nil
		case "enter":
			// Apply selected preset
			m.formInputs[fieldCron].SetValue(m.cronPresets[m.cronHelperIndex].expr)
			m.showCronHelper = false
			m.validateForm()
			return m, nil
		case "esc", "?":
			m.showCronHelper = false
			return m, nil
		}
		return m, nil
	}

	switch msg.String() {
	case "esc":
		m.currentView = ViewList
		m.resetForm()
		return m, nil
	case "?":
		// Show cron helper when in cron field
		if m.formFocus == fieldCron {
			m.showCronHelper = true
			m.cronHelperIndex = 0
			return m, nil
		}
	case "tab":
		nextField := (m.formFocus + 1) % fieldCount
		m.focusFormField(nextField)
		m.validateForm()
		return m, textinput.Blink
	case "shift+tab":
		prevField := m.formFocus - 1
		if prevField < 0 {
			prevField = fieldCount - 1
		}
		m.focusFormField(prevField)
		m.validateForm()
		return m, textinput.Blink
	case "ctrl+s":
		if m.validateForm() {
			return m, m.saveTask()
		}
		return m, nil
	case "enter":
		// In textarea (prompt), enter adds newline - don't navigate
		if m.formFocus == fieldPrompt {
			m.promptInput, cmd = m.promptInput.Update(msg)
			m.validateForm()
			return m, cmd
		}
		// On last field, submit if valid
		if m.formFocus == fieldCount-1 {
			if m.validateForm() {
				return m, m.saveTask()
			}
			return m, nil
		}
		// Otherwise navigate to next field
		nextField := (m.formFocus + 1) % fieldCount
		m.focusFormField(nextField)
		m.validateForm()
		return m, textinput.Blink
	}

	// Update the focused input
	if m.formFocus == fieldPrompt {
		m.promptInput, cmd = m.promptInput.Update(msg)
	} else {
		m.formInputs[m.formFocus], cmd = m.formInputs[m.formFocus].Update(msg)
	}

	// Real-time validation
	m.validateForm()

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
	case "t":
		return m, m.toggleTask(m.selectedTask.ID)
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
		prompt := strings.TrimSpace(m.promptInput.Value())
		cronExpr := strings.TrimSpace(m.formInputs[fieldCron].Value())
		workingDir := strings.TrimSpace(m.formInputs[fieldWorkingDir].Value())
		discordWebhook := strings.TrimSpace(m.formInputs[fieldDiscordWebhook].Value())
		slackWebhook := strings.TrimSpace(m.formInputs[fieldSlackWebhook].Value())

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
			SlackWebhook:   slackWebhook,
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
			return taskToggledMsg{id: id, enabled: task.Enabled}
		}
		return taskToggledMsg{id: id, enabled: false}
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

	// Render the base content
	baseView := appStyle.Render(content)

	// Overlay delete confirmation modal if active
	if m.confirmDelete {
		return m.renderDeleteModal(baseView)
	}

	return baseView
}

// renderDeleteModal renders a centered modal overlay on top of the base view
func (m Model) renderDeleteModal(baseView string) string {
	// Button styles
	activeButtonStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("#FFFFFF")).
		Background(primaryColor).
		Padding(0, 3).
		MarginRight(2).
		Bold(true)

	inactiveButtonStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("#FFFFFF")).
		Background(lipgloss.Color("#666666")).
		Padding(0, 3).
		MarginRight(2)

	// Modal content
	var yesBtn, noBtn string
	if m.deleteConfirmFocus == 0 {
		yesBtn = activeButtonStyle.Render("Yes")
		noBtn = inactiveButtonStyle.Render("No")
	} else {
		yesBtn = inactiveButtonStyle.Render("Yes")
		noBtn = activeButtonStyle.Render("No")
	}

	buttons := lipgloss.JoinHorizontal(lipgloss.Center, yesBtn, noBtn)

	question := lipgloss.NewStyle().
		Bold(true).
		Foreground(lipgloss.Color("#FFFFFF")).
		MarginBottom(1).
		Render(fmt.Sprintf("Delete task '%s'?", m.deleteTaskName))

	hint := subtitleStyle.Render("←/→ to select • enter to confirm • esc to cancel")

	modalContent := lipgloss.JoinVertical(lipgloss.Center,
		question,
		"",
		buttons,
		"",
		hint,
	)

	// Modal box style
	modalStyle := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color("#FF6B6B")).
		Padding(1, 4).
		Background(lipgloss.Color("#1a1a2e")).
		Align(lipgloss.Center)

	modal := modalStyle.Render(modalContent)

	// Center the modal on screen using lipgloss.Place
	return lipgloss.Place(
		m.width,
		m.height,
		lipgloss.Center,
		lipgloss.Center,
		modal,
		lipgloss.WithWhitespaceChars(" "),
		lipgloss.WithWhitespaceForeground(lipgloss.Color("#333333")),
	)
}

func (m Model) renderList() string {
	var b strings.Builder

	// Header with usage status (right-justified)
	logo := spriteIcon + " " + logoStyle.Render("Claude Tasks")
	if m.usageData != nil && m.width > 0 {
		usageBar := m.renderUsageBar()
		logoWidth := lipgloss.Width(logo)
		usageWidth := lipgloss.Width(usageBar)
		padding := m.width - logoWidth - usageWidth - 4 // account for app padding
		if padding < 2 {
			padding = 2
		}
		b.WriteString(logo)
		b.WriteString(strings.Repeat(" ", padding))
		b.WriteString(usageBar)
	} else {
		b.WriteString(logo)
	}
	b.WriteString("\n\n")

	// Show search bar if in search mode
	if m.searchMode {
		searchStyle := lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(accentColor).
			Padding(0, 1)
		b.WriteString(searchStyle.Render("/ " + m.searchInput.View()))
		b.WriteString("\n\n")
	}

	// Show running indicator if any tasks are running
	hasRunning := len(m.runningTasks) > 0
	if hasRunning {
		b.WriteString(m.spinner.View())
		b.WriteString(" ")
		b.WriteString(statusRunning.Render(fmt.Sprintf("%d task(s) running", len(m.runningTasks))))
		b.WriteString("\n\n")
	}


	// Table or empty state
	tasksToShow := m.getDisplayTasks()
	if len(m.tasks) == 0 {
		empty := emptyBoxStyle.Render("No tasks yet\n\nPress 'a' to add your first task")
		b.WriteString(empty)
	} else if m.searchMode && len(tasksToShow) == 0 && m.searchInput.Value() != "" {
		empty := emptyBoxStyle.Render("No tasks match your search\n\nPress 'esc' to clear")
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
		helpText := m.help.ShortHelpView(keys.ShortHelp())
		// Add search hint
		helpText += "  " + helpKeyStyle.Render("/") + helpDescStyle.Render(" search")
		b.WriteString(helpText)
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

	b.WriteString(spriteIcon)
	b.WriteString(" ")
	b.WriteString(logoStyle.Render("Settings"))
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

	b.WriteString(spriteIcon)
	b.WriteString(" ")
	b.WriteString(logoStyle.Render(title))
	b.WriteString("\n\n")

	// Show cron helper overlay if active
	if m.showCronHelper {
		b.WriteString(m.renderCronHelper())
		return b.String()
	}

	labels := []string{"Name", "Prompt", "Cron Expression", "Working Directory", "Discord Webhook (optional)", "Slack Webhook (optional)"}
	hints := []string{
		"",
		"(multi-line, tab to next field)",
		"Press ? for presets",
		"",
		"",
		"",
	}

	for i, label := range labels {
		b.WriteString(inputLabelStyle.Render(label))
		if hints[i] != "" {
			b.WriteString("  ")
			b.WriteString(subtitleStyle.Render(hints[i]))
		}

		// Show validation status indicator
		if errMsg, hasErr := m.formValidation[i]; hasErr {
			b.WriteString("  ")
			b.WriteString(errorMsgStyle.Render("✗ " + errMsg))
		} else if i != fieldDiscordWebhook && i != fieldSlackWebhook { // Don't show checkmark for optional fields
			// Show checkmark if field has content and is valid
			var hasContent bool
			if i == fieldPrompt {
				hasContent = strings.TrimSpace(m.promptInput.Value()) != ""
			} else {
				hasContent = strings.TrimSpace(m.formInputs[i].Value()) != ""
			}
			if hasContent {
				b.WriteString("  ")
				b.WriteString(successMsgStyle.Render("✓"))
			}
		}
		b.WriteString("\n")

		// Prompt field uses textarea
		if i == fieldPrompt {
			if i == m.formFocus {
				b.WriteString(focusedInputStyle.Render(m.promptInput.View()))
			} else {
				b.WriteString(blurredInputStyle.Render(m.promptInput.View()))
			}
		} else {
			if i == m.formFocus {
				b.WriteString(focusedInputStyle.Render(m.formInputs[i].View()))
			} else {
				b.WriteString(blurredInputStyle.Render(m.formInputs[i].View()))
			}
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
	b.WriteString(subtitleStyle.Render("Cron format: "))
	b.WriteString(dimRowStyle.Render("sec min hour day month weekday"))

	return b.String()
}

func (m Model) renderCronHelper() string {
	var b strings.Builder

	helperStyle := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(accentColor).
		Padding(1, 2)

	var content strings.Builder
	content.WriteString(inputLabelStyle.Render("Select a schedule preset"))
	content.WriteString("\n\n")

	for i, preset := range m.cronPresets {
		if i == m.cronHelperIndex {
			// Highlighted item
			content.WriteString(lipgloss.NewStyle().
				Background(primaryColor).
				Foreground(lipgloss.Color("#FFFFFF")).
				Bold(true).
				Padding(0, 1).
				Render(preset.name))
		} else {
			content.WriteString("  ")
			content.WriteString(preset.name)
		}
		content.WriteString("\n")
		content.WriteString(subtitleStyle.Render("  " + preset.expr + " - " + preset.desc))
		content.WriteString("\n")
	}

	content.WriteString("\n")
	content.WriteString(helpKeyStyle.Render("↑/↓"))
	content.WriteString(helpDescStyle.Render(" navigate • "))
	content.WriteString(helpKeyStyle.Render("enter"))
	content.WriteString(helpDescStyle.Render(" select • "))
	content.WriteString(helpKeyStyle.Render("esc"))
	content.WriteString(helpDescStyle.Render(" cancel"))

	b.WriteString(helperStyle.Render(content.String()))
	return b.String()
}

func (m Model) renderOutput() string {
	var b strings.Builder

	b.WriteString(spriteIcon)
	b.WriteString(" ")
	b.WriteString(logoStyle.Render(m.selectedTask.Name))
	b.WriteString("  ")
	if m.selectedTask.Enabled {
		b.WriteString(statusOK.Render("● enabled"))
	} else {
		b.WriteString(statusFail.Render("○ disabled"))
	}
	b.WriteString("\n")
	b.WriteString(subtitleStyle.Render(m.selectedTask.Prompt))
	b.WriteString("\n\n")

	b.WriteString(m.viewport.View())
	b.WriteString("\n\n")

	// Help
	helpText := helpKeyStyle.Render("↑/↓") + helpDescStyle.Render(" scroll • ") +
		helpKeyStyle.Render("t") + helpDescStyle.Render(" toggle • ") +
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
