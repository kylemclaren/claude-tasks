package webhook

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/kylemclaren/claude-tasks/internal/db"
)

// Discord handles Discord webhook notifications
type Discord struct {
	client *http.Client
}

// NewDiscord creates a new Discord webhook handler
func NewDiscord() *Discord {
	return &Discord{
		client: &http.Client{Timeout: 10 * time.Second},
	}
}

// DiscordEmbed represents a Discord embed object
type DiscordEmbed struct {
	Title       string       `json:"title"`
	Description string       `json:"description"`
	Color       int          `json:"color"`
	Fields      []EmbedField `json:"fields,omitempty"`
	Timestamp   string       `json:"timestamp,omitempty"`
	Footer      *EmbedFooter `json:"footer,omitempty"`
}

// EmbedField represents a field in a Discord embed
type EmbedField struct {
	Name   string `json:"name"`
	Value  string `json:"value"`
	Inline bool   `json:"inline"`
}

// EmbedFooter represents the footer of a Discord embed
type EmbedFooter struct {
	Text string `json:"text"`
}

// DiscordPayload represents the webhook payload
type DiscordPayload struct {
	Content string         `json:"content,omitempty"`
	Embeds  []DiscordEmbed `json:"embeds,omitempty"`
}

// SendResult sends a task result to Discord
func (d *Discord) SendResult(webhookURL string, task *db.Task, run *db.TaskRun) error {
	// Determine color based on status
	var color int
	var statusEmoji string
	switch run.Status {
	case db.RunStatusCompleted:
		color = 0x00FF00 // Green
		statusEmoji = "✅"
	case db.RunStatusFailed:
		color = 0xFF0000 // Red
		statusEmoji = "❌"
	default:
		color = 0xFFFF00 // Yellow
		statusEmoji = "⏳"
	}

	// Truncate output if too long (Discord has 4096 char limit for embed description)
	// Keep markdown formatting - Discord embeds support bold, italic, links, lists, etc.
	output := run.Output
	if len(output) > 3500 {
		output = output[:3500] + "\n\n*... (truncated)*"
	}
	if output == "" {
		output = "*No output*"
	}

	// Calculate duration
	var duration string
	if run.EndedAt != nil {
		dur := run.EndedAt.Sub(run.StartedAt)
		duration = dur.Round(time.Second).String()
	} else {
		duration = "running"
	}

	embed := DiscordEmbed{
		Title:       fmt.Sprintf("%s Task: %s", statusEmoji, task.Name),
		Description: output,
		Color:       color,
		Fields: []EmbedField{
			{Name: "Status", Value: string(run.Status), Inline: true},
			{Name: "Duration", Value: duration, Inline: true},
			{Name: "Working Dir", Value: fmt.Sprintf("`%s`", task.WorkingDir), Inline: true},
		},
		Timestamp: run.StartedAt.Format(time.RFC3339),
		Footer:    &EmbedFooter{Text: "Claude Tasks Scheduler"},
	}

	// Add error field if present - errors still use code block for readability
	if run.Error != "" {
		errMsg := run.Error
		if len(errMsg) > 500 {
			errMsg = errMsg[:500] + "..."
		}
		embed.Fields = append(embed.Fields, EmbedField{
			Name:   "⚠️ Error",
			Value:  fmt.Sprintf("```\n%s\n```", errMsg),
			Inline: false,
		})
	}

	payload := DiscordPayload{
		Embeds: []DiscordEmbed{embed},
	}

	return d.send(webhookURL, payload)
}

func (d *Discord) send(webhookURL string, payload DiscordPayload) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal payload: %w", err)
	}

	req, err := http.NewRequest("POST", webhookURL, bytes.NewBuffer(data))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := d.client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to send webhook: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("webhook returned status %d", resp.StatusCode)
	}

	return nil
}
