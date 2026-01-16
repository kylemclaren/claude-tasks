package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/kylemclaren/claude-tasks/internal/db"
	"github.com/kylemclaren/claude-tasks/internal/executor"
	"github.com/kylemclaren/claude-tasks/internal/scheduler"
	"github.com/kylemclaren/claude-tasks/internal/stream"
)

// Server represents the API server
type Server struct {
	db        *db.DB
	scheduler *scheduler.Scheduler
	executor  *executor.Executor
	streamMgr *stream.Manager
	router    chi.Router
}

// NewServer creates a new API server
func NewServer(database *db.DB, sched *scheduler.Scheduler) *Server {
	// Get stream manager from scheduler if available, otherwise create new one
	var streamMgr *stream.Manager
	if sched != nil && sched.GetStreamManager() != nil {
		streamMgr = sched.GetStreamManager()
	} else {
		streamMgr = stream.NewManager()
		if sched != nil {
			sched.SetStreamManager(streamMgr)
		}
	}

	s := &Server{
		db:        database,
		scheduler: sched,
		executor:  executor.NewWithStreamManager(database, streamMgr),
		streamMgr: streamMgr,
		router:    chi.NewRouter(),
	}
	s.setupRoutes()
	return s
}

// NewServerWithStreamManager creates a new API server with an existing stream manager
func NewServerWithStreamManager(database *db.DB, sched *scheduler.Scheduler, streamMgr *stream.Manager) *Server {
	s := &Server{
		db:        database,
		scheduler: sched,
		executor:  executor.NewWithStreamManager(database, streamMgr),
		streamMgr: streamMgr,
		router:    chi.NewRouter(),
	}
	s.setupRoutes()
	return s
}

func (s *Server) setupRoutes() {
	r := s.router

	// Global middleware
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(CORS)

	// API routes
	r.Route("/api/v1", func(r chi.Router) {
		// Health check
		r.Get("/health", s.HealthCheck)

		// Tasks
		r.Route("/tasks", func(r chi.Router) {
			r.Get("/", s.ListTasks)
			r.Post("/", s.CreateTask)
			r.Get("/{id}", s.GetTask)
			r.Put("/{id}", s.UpdateTask)
			r.Delete("/{id}", s.DeleteTask)
			r.Post("/{id}/toggle", s.ToggleTask)
			r.Post("/{id}/run", s.RunTask)
			r.Post("/{id}/run/streaming", s.RunTaskStreaming) // Start task with streaming, returns run ID
			r.Get("/{id}/runs", s.GetTaskRuns)
			r.Get("/{id}/runs/latest", s.GetLatestTaskRun)
			r.Get("/{id}/runs/{runId}", s.GetTaskRunByID)         // Get specific run
			r.Get("/{id}/runs/{runId}/stream", s.StreamTaskRun)   // SSE endpoint for streaming output
		})

		// Settings
		r.Get("/settings", s.GetSettings)
		r.Put("/settings", s.UpdateSettings)

		// Usage
		r.Get("/usage", s.GetUsage)
	})
}

// Router returns the chi router for use with http.Server
func (s *Server) Router() http.Handler {
	return s.router
}
