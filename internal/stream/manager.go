package stream

import (
	"sync"
	"time"
)

// OutputChunk represents a chunk of streaming output
type OutputChunk struct {
	RunID     int64     `json:"run_id"`
	Text      string    `json:"text"`
	Timestamp time.Time `json:"timestamp"`
	IsError   bool      `json:"is_error,omitempty"`
}

// CompletionEvent signals that a run has finished
type CompletionEvent struct {
	RunID  int64  `json:"run_id"`
	Status string `json:"status"` // "completed" or "failed"
	Error  string `json:"error,omitempty"`
}

// Client represents a connected SSE client
type Client struct {
	ID       string
	Chunks   chan OutputChunk
	Complete chan CompletionEvent
	Done     chan struct{}
}

// RunStream manages subscribers for a single run
type RunStream struct {
	runID       int64
	clients     map[string]*Client
	buffer      []OutputChunk
	completed   bool
	completion  *CompletionEvent
	mu          sync.RWMutex
	bufferLimit int
}

// Manager manages all active run streams
type Manager struct {
	streams map[int64]*RunStream
	mu      sync.RWMutex
}

// NewManager creates a new stream manager
func NewManager() *Manager {
	return &Manager{
		streams: make(map[int64]*RunStream),
	}
}

// getOrCreateStream gets or creates a stream for a run
func (m *Manager) getOrCreateStream(runID int64) *RunStream {
	m.mu.Lock()
	defer m.mu.Unlock()

	if stream, ok := m.streams[runID]; ok {
		return stream
	}

	stream := &RunStream{
		runID:       runID,
		clients:     make(map[string]*Client),
		buffer:      make([]OutputChunk, 0, 100),
		bufferLimit: 100,
	}
	m.streams[runID] = stream
	return stream
}

// Subscribe registers a client for updates on a run
// Returns a Client with channels for receiving chunks and completion events
func (m *Manager) Subscribe(runID int64, clientID string) *Client {
	stream := m.getOrCreateStream(runID)

	client := &Client{
		ID:       clientID,
		Chunks:   make(chan OutputChunk, 100),
		Complete: make(chan CompletionEvent, 1),
		Done:     make(chan struct{}),
	}

	stream.mu.Lock()
	defer stream.mu.Unlock()

	// Send buffered chunks to the new client
	for _, chunk := range stream.buffer {
		select {
		case client.Chunks <- chunk:
		default:
			// Client channel full, skip
		}
	}

	// If already completed, send completion event
	if stream.completed && stream.completion != nil {
		select {
		case client.Complete <- *stream.completion:
		default:
		}
	}

	stream.clients[clientID] = client
	return client
}

// Unsubscribe removes a client from a run's updates
func (m *Manager) Unsubscribe(runID int64, clientID string) {
	m.mu.RLock()
	stream, ok := m.streams[runID]
	m.mu.RUnlock()

	if !ok {
		return
	}

	stream.mu.Lock()
	if client, ok := stream.clients[clientID]; ok {
		close(client.Done)
		delete(stream.clients, clientID)
	}
	stream.mu.Unlock()

	// Clean up empty streams
	m.cleanupStream(runID)
}

// Publish sends an output chunk to all subscribed clients
func (m *Manager) Publish(chunk OutputChunk) {
	stream := m.getOrCreateStream(chunk.RunID)

	stream.mu.Lock()
	defer stream.mu.Unlock()

	// Add to buffer (circular if at limit)
	if len(stream.buffer) >= stream.bufferLimit {
		stream.buffer = stream.buffer[1:]
	}
	stream.buffer = append(stream.buffer, chunk)

	// Send to all clients
	for _, client := range stream.clients {
		select {
		case client.Chunks <- chunk:
		default:
			// Client channel full, skip
		}
	}
}

// PublishText is a convenience method to publish a text chunk
func (m *Manager) PublishText(runID int64, text string) {
	m.Publish(OutputChunk{
		RunID:     runID,
		Text:      text,
		Timestamp: time.Now(),
	})
}

// PublishError publishes an error chunk
func (m *Manager) PublishError(runID int64, text string) {
	m.Publish(OutputChunk{
		RunID:     runID,
		Text:      text,
		Timestamp: time.Now(),
		IsError:   true,
	})
}

// Complete signals that a run has finished
func (m *Manager) Complete(runID int64, status string, errorMsg string) {
	m.mu.RLock()
	stream, ok := m.streams[runID]
	m.mu.RUnlock()

	if !ok {
		return
	}

	completion := CompletionEvent{
		RunID:  runID,
		Status: status,
		Error:  errorMsg,
	}

	stream.mu.Lock()
	stream.completed = true
	stream.completion = &completion

	// Send completion to all clients
	for _, client := range stream.clients {
		select {
		case client.Complete <- completion:
		default:
		}
	}
	stream.mu.Unlock()
}

// GetAccumulatedOutput returns all buffered output for a run
func (m *Manager) GetAccumulatedOutput(runID int64) string {
	m.mu.RLock()
	stream, ok := m.streams[runID]
	m.mu.RUnlock()

	if !ok {
		return ""
	}

	stream.mu.RLock()
	defer stream.mu.RUnlock()

	var output string
	for _, chunk := range stream.buffer {
		output += chunk.Text
	}
	return output
}

// IsRunStreaming returns true if a run has an active stream
func (m *Manager) IsRunStreaming(runID int64) bool {
	m.mu.RLock()
	stream, ok := m.streams[runID]
	m.mu.RUnlock()

	if !ok {
		return false
	}

	stream.mu.RLock()
	defer stream.mu.RUnlock()

	return !stream.completed
}

// cleanupStream removes a stream if it has no clients and is completed
func (m *Manager) cleanupStream(runID int64) {
	m.mu.Lock()
	defer m.mu.Unlock()

	stream, ok := m.streams[runID]
	if !ok {
		return
	}

	stream.mu.RLock()
	clientCount := len(stream.clients)
	completed := stream.completed
	stream.mu.RUnlock()

	// Only cleanup if no clients and completed
	if clientCount == 0 && completed {
		delete(m.streams, runID)
	}
}

// CleanupOldStreams removes completed streams older than the given duration
func (m *Manager) CleanupOldStreams(maxAge time.Duration) {
	m.mu.Lock()
	defer m.mu.Unlock()

	cutoff := time.Now().Add(-maxAge)

	for runID, stream := range m.streams {
		stream.mu.RLock()
		clientCount := len(stream.clients)
		completed := stream.completed
		var lastActivity time.Time
		if len(stream.buffer) > 0 {
			lastActivity = stream.buffer[len(stream.buffer)-1].Timestamp
		}
		stream.mu.RUnlock()

		// Remove if no clients, completed, and no recent activity
		if clientCount == 0 && completed && lastActivity.Before(cutoff) {
			delete(m.streams, runID)
		}
	}
}
