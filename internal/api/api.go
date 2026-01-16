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

	// API routes - all at top level to avoid chi subrouter issues with multiple params
	r.Get("/api/v1/health", s.HealthCheck)

	// Tasks
	r.Get("/api/v1/tasks", s.ListTasks)
	r.Post("/api/v1/tasks", s.CreateTask)
	r.Get("/api/v1/tasks/{id}", s.GetTask)
	r.Put("/api/v1/tasks/{id}", s.UpdateTask)
	r.Delete("/api/v1/tasks/{id}", s.DeleteTask)
	r.Post("/api/v1/tasks/{id}/toggle", s.ToggleTask)
	r.Post("/api/v1/tasks/{id}/run", s.RunTask)
	r.Post("/api/v1/tasks/{id}/run/streaming", s.RunTaskStreaming)
	r.Get("/api/v1/tasks/{id}/runs", s.GetTaskRuns)
	r.Get("/api/v1/tasks/{id}/runs/latest", s.GetLatestTaskRun)
	r.Get("/api/v1/tasks/{id}/runs/{runId}", s.GetTaskRunByID)
	r.Get("/api/v1/tasks/{id}/runs/{runId}/stream", s.StreamTaskRun)

	// Settings
	r.Get("/api/v1/settings", s.GetSettings)
	r.Put("/api/v1/settings", s.UpdateSettings)

	// Usage
	r.Get("/api/v1/usage", s.GetUsage)
}

// Router returns the chi router for use with http.Server
func (s *Server) Router() http.Handler {
	return s.router
}
