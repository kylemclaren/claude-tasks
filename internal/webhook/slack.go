package webhook

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/kylemclaren/claude-tasks/internal/db"
)

// Slack handles Slack webhook notifications
type Slack struct {
	client *http.Client
}

// NewSlack creates a new Slack webhook handler
func NewSlack() *Slack {
	return &Slack{
		client: &http.Client{Timeout: 10 * time.Second},
	}
}

// SlackBlock represents a Slack Block Kit block
type SlackBlock struct {
	Type     string         `json:"type"`
	Text     *SlackTextObj  `json:"text,omitempty"`
	Fields   []SlackTextObj `json:"fields,omitempty"`
	Elements []SlackElement `json:"elements,omitempty"`
}

// SlackTextObj represents a Slack text object
type SlackTextObj struct {
	Type  string `json:"type"`
	Text  string `json:"text"`
	Emoji bool   `json:"emoji,omitempty"`
}

// SlackElement represents a Slack element (for context blocks)
type SlackElement struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

// SlackAttachment represents a Slack attachment (for colored sidebar)
type SlackAttachment struct {
	Color  string       `json:"color"`
	Blocks []SlackBlock `json:"blocks"`
}

// SlackPayload represents the webhook payload
type SlackPayload struct {
	Text        string            `json:"text,omitempty"`
	Attachments []SlackAttachment `json:"attachments,omitempty"`
}

// SendResult sends a task result to Slack
func (s *Slack) SendResult(webhookURL string, task *db.Task, run *db.TaskRun) error {
	// Determine color and emoji based on status
	var color, statusEmoji, statusText string
	switch run.Status {
	case db.RunStatusCompleted:
		color = "#00FF00" // Green
		statusEmoji = ":white_check_mark:"
		statusText = "Completed"
	case db.RunStatusFailed:
		color = "#FF0000" // Red
		statusEmoji = ":x:"
		statusText = "Failed"
	default:
		color = "#FFFF00" // Yellow
		statusEmoji = ":hourglass:"
		statusText = "Running"
	}

	// Calculate duration
	var duration string
	if run.EndedAt != nil {
		d := run.EndedAt.Sub(run.StartedAt)
		duration = d.Round(time.Second).String()
	} else {
		duration = "running"
	}

	// Convert markdown to Slack mrkdwn format
	output := convertToSlackMarkdown(run.Output)
	if len(output) > 2500 {
		output = output[:2500] + "\n... _(truncated)_"
	}
	if output == "" {
		output = "_No output_"
	}

	// Build blocks
	blocks := []SlackBlock{
		{
			Type: "header",
			Text: &SlackTextObj{
				Type:  "plain_text",
				Text:  fmt.Sprintf("%s Task: %s", statusEmoji, task.Name),
				Emoji: true,
			},
		},
		{
			Type: "section",
			Fields: []SlackTextObj{
				{Type: "mrkdwn", Text: fmt.Sprintf("*Status:*\n%s", statusText)},
				{Type: "mrkdwn", Text: fmt.Sprintf("*Duration:*\n%s", duration)},
				{Type: "mrkdwn", Text: fmt.Sprintf("*Working Dir:*\n`%s`", task.WorkingDir)},
				{Type: "mrkdwn", Text: fmt.Sprintf("*Started:*\n<!date^%d^{date_short} {time}|%s>", run.StartedAt.Unix(), run.StartedAt.Format(time.RFC3339))},
			},
		},
		{
			Type: "divider",
		},
		{
			Type: "section",
			Text: &SlackTextObj{
				Type: "mrkdwn",
				Text: output,
			},
		},
	}

	// Add error block if present
	if run.Error != "" {
		errMsg := run.Error
		if len(errMsg) > 500 {
			errMsg = errMsg[:500] + "..."
		}
		blocks = append(blocks, SlackBlock{
			Type: "section",
			Text: &SlackTextObj{
				Type: "mrkdwn",
				Text: fmt.Sprintf(":warning: *Error:*\n```%s```", errMsg),
			},
		})
	}

	// Add footer context
	blocks = append(blocks, SlackBlock{
		Type: "context",
		Elements: []SlackElement{
			{Type: "mrkdwn", Text: "Claude Tasks Scheduler"},
		},
	})

	payload := SlackPayload{
		Attachments: []SlackAttachment{
			{
				Color:  color,
				Blocks: blocks,
			},
		},
	}

	return s.send(webhookURL, payload)
}

// convertToSlackMarkdown converts standard markdown to Slack's mrkdwn format
func convertToSlackMarkdown(text string) string {
	// Slack uses different markdown:
	// - Bold: *text* (not **text**)
	// - Italic: _text_ (same)
	// - Strikethrough: ~text~ (same)
	// - Code: `code` (same)
	// - Code blocks: ```code``` (same)
	// - Links: <url|text> (not [text](url))

	result := text

	// Convert **bold** to *bold*
	// Be careful not to affect code blocks
	lines := strings.Split(result, "\n")
	inCodeBlock := false
	for i, line := range lines {
		if strings.HasPrefix(line, "```") {
			inCodeBlock = !inCodeBlock
		}
		if !inCodeBlock {
			// Replace **text** with *text* for bold
			// Simple approach: replace ** with * (works for paired **)
			for strings.Contains(lines[i], "**") {
				lines[i] = strings.Replace(lines[i], "**", "*", 2)
			}

			// Convert [text](url) to <url|text>
			// This is a simple conversion - may not handle all edge cases
			for {
				start := strings.Index(lines[i], "[")
				if start == -1 {
					break
				}
				end := strings.Index(lines[i][start:], "](")
				if end == -1 {
					break
				}
				end += start
				urlEnd := strings.Index(lines[i][end+2:], ")")
				if urlEnd == -1 {
					break
				}
				urlEnd += end + 2

				linkText := lines[i][start+1 : end]
				linkURL := lines[i][end+2 : urlEnd]
				slackLink := fmt.Sprintf("<%s|%s>", linkURL, linkText)
				lines[i] = lines[i][:start] + slackLink + lines[i][urlEnd+1:]
			}

			// Convert # headers to bold (Slack doesn't support headers)
			if strings.HasPrefix(strings.TrimSpace(lines[i]), "#") {
				trimmed := strings.TrimSpace(lines[i])
				// Remove # prefix and make bold
				headerText := strings.TrimLeft(trimmed, "# ")
				lines[i] = "*" + headerText + "*"
			}
		}
	}

	return strings.Join(lines, "\n")
}

func (s *Slack) send(webhookURL string, payload SlackPayload) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal payload: %w", err)
	}

	req, err := http.NewRequest("POST", webhookURL, bytes.NewBuffer(data))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to send webhook: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("webhook returned status %d", resp.StatusCode)
	}

	return nil
}
