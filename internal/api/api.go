package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/kylemclaren/claude-tasks/internal/db"
	"github.com/kylemclaren/claude-tasks/internal/executor"
	"github.com/kylemclaren/claude-tasks/internal/scheduler"
)

// Server represents the API server
type Server struct {
	db        *db.DB
	scheduler *scheduler.Scheduler
	executor  *executor.Executor
	router    chi.Router
}

// NewServer creates a new API server
func NewServer(database *db.DB, sched *scheduler.Scheduler) *Server {
	s := &Server{
		db:        database,
		scheduler: sched,
		executor:  executor.New(database),
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
			r.Get("/{id}/runs", s.GetTaskRuns)
			r.Get("/{id}/runs/latest", s.GetLatestTaskRun)
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
