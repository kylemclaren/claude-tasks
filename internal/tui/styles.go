package tui

import "github.com/charmbracelet/lipgloss"

var (
	// Claude brand colors
	claudeOrange  = lipgloss.Color("#d97757") // Primary accent
	claudeBlue    = lipgloss.Color("#6a9bcc") // Secondary accent
	claudeGreen   = lipgloss.Color("#788c5d") // Tertiary accent
	claudeMidGray = lipgloss.Color("#b0aea5") // Secondary elements

	// Mapped colors for TUI
	primaryColor = claudeOrange
	accentColor  = claudeBlue
	successColor = claudeGreen
	errorColor   = lipgloss.Color("#c45c4a") // Darker orange-red for errors
	warningColor = claudeOrange
	dimTextColor = claudeMidGray

	// App frame
	appStyle = lipgloss.NewStyle().
			Padding(1, 2)

	// Logo
	logoStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(accentColor)

	// Table row style
	dimRowStyle = lipgloss.NewStyle().
			Foreground(dimTextColor).
			Padding(0, 1)

	// Form styles
	inputLabelStyle = lipgloss.NewStyle().
			Foreground(accentColor).
			Bold(true).
			MarginBottom(0)

	focusedInputStyle = lipgloss.NewStyle().
				Border(lipgloss.RoundedBorder()).
				BorderForeground(primaryColor).
				Padding(0, 1)

	blurredInputStyle = lipgloss.NewStyle().
				Border(lipgloss.RoundedBorder()).
				BorderForeground(dimTextColor).
				Padding(0, 1)

	// Status indicators
	statusOK = lipgloss.NewStyle().
			Foreground(successColor).
			Bold(true)

	statusFail = lipgloss.NewStyle().
			Foreground(errorColor).
			Bold(true)

	statusRunning = lipgloss.NewStyle().
			Foreground(warningColor).
			Bold(true)

	statusPending = lipgloss.NewStyle().
			Foreground(dimTextColor)

	// Help
	helpKeyStyle = lipgloss.NewStyle().
			Foreground(accentColor).
			Bold(true)

	helpDescStyle = lipgloss.NewStyle().
			Foreground(dimTextColor)

	// Misc
	subtitleStyle = lipgloss.NewStyle().
			Foreground(dimTextColor).
			Italic(true)

	errorMsgStyle = lipgloss.NewStyle().
			Foreground(errorColor).
			Bold(true)

	successMsgStyle = lipgloss.NewStyle().
			Foreground(successColor).
			Bold(true)

	// Box for empty state
	emptyBoxStyle = lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(dimTextColor).
			Foreground(dimTextColor).
			Padding(2, 4).
			Align(lipgloss.Center)

	// Divider
	dividerStyle = lipgloss.NewStyle().
			Foreground(dimTextColor)
)
