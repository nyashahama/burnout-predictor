package api

import (
	"context"
	"encoding/json"
	"log/slog"
	"math"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/nyasha-hama/burnout-predictor-api/internal/ai"
	db "github.com/nyasha-hama/burnout-predictor-api/internal/db/sqlc"
	eml "github.com/nyasha-hama/burnout-predictor-api/internal/email"
	"github.com/nyasha-hama/burnout-predictor-api/internal/api/handler"
	"github.com/nyasha-hama/burnout-predictor-api/internal/api/middleware"
	"github.com/nyasha-hama/burnout-predictor-api/internal/store"
	authsvc "github.com/nyasha-hama/burnout-predictor-api/internal/service/auth"
	billingsvc "github.com/nyasha-hama/burnout-predictor-api/internal/service/billing"
	checkinsvc "github.com/nyasha-hama/burnout-predictor-api/internal/service/checkin"
	insightsvc "github.com/nyasha-hama/burnout-predictor-api/internal/service/insight"
)

// ServerConfig holds all dependencies needed to build the HTTP handler.
type ServerConfig struct {
	Queries      *db.Queries
	Pool         *pgxpool.Pool
	JWTSecret    string
	EmailClient  *eml.Client
	AIClient     *ai.Client
	PaddleSecret string
	AppURL       string
	CORSOrigin   string
	StartTime    time.Time
	Logger       *slog.Logger
}

// NewServer builds and returns the chi router wired up with all handlers.
func NewServer(ctx context.Context, cfg ServerConfig) http.Handler {
	log := cfg.Logger
	if log == nil {
		log = slog.Default()
	}

	pg := store.New(cfg.Queries)

	authService := authsvc.New(pg, []byte(cfg.JWTSecret), cfg.EmailClient, cfg.AppURL, log)
	checkinService := checkinsvc.New(pg, cfg.AIClient, log)
	insightService := insightsvc.New(pg)
	billingService := billingsvc.New(pg, log)

	authH := handler.NewAuthHandler(authService)
	checkinH := handler.NewCheckinHandler(checkinService)
	insightH := handler.NewInsightHandler(insightService)
	followUpH := handler.NewFollowUpHandler(pg)
	userH := handler.NewUserHandler(authService)
	webhookH := handler.NewWebhookHandler(billingService, []byte(cfg.PaddleSecret))
	notifH := handler.NewNotifPrefsHandler(pg)
	subH := handler.NewSubscriptionHandler(pg)
	exportH := handler.NewExportHandler(pg)

	secret := authService.JWTSecret()
	authMW := middleware.Auth(pg, secret)

	corsOrigin := cfg.CORSOrigin
	if corsOrigin == "" {
		corsOrigin = "*"
	}

	r := chi.NewRouter()
	r.Use(middleware.RequestID())
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)
	r.Use(chimw.Timeout(30 * time.Second))
	r.Use(corsMiddleware(corsOrigin))

	// Health check — no auth, no rate limit.
	r.Get("/health", healthHandler(cfg.Pool, cfg.StartTime))

	// Public webhook.
	r.Post("/api/webhooks/paddle", webhookH.Paddle)

	// Public auth routes with per-IP rate limiting.
	r.Group(func(r chi.Router) {
		r.Use(middleware.RateLimit(20, time.Minute))
		r.Post("/api/auth/register", authH.Register)
		r.Post("/api/auth/login", authH.Login)
		r.Post("/api/auth/refresh", authH.RefreshToken)
		r.Post("/api/auth/forgot-password", authH.ForgotPassword)
		r.Post("/api/auth/reset-password", authH.ResetPassword)
		r.Post("/api/auth/verify-email", authH.VerifyEmail)
	})

	// Authenticated routes.
	r.Group(func(r chi.Router) {
		r.Use(authMW)

		r.Post("/api/auth/logout", authH.Logout)
		r.Post("/api/auth/resend-verification", authH.ResendVerification)

		r.Get("/api/user", userH.GetProfile)
		r.Patch("/api/user", userH.UpdateProfile)
		r.Patch("/api/user/password", authH.ChangePassword)
		r.Patch("/api/user/email", authH.ChangeEmail)
		r.Delete("/api/user", authH.DeleteAccount)
		r.Get("/api/user/subscription", subH.Get)
		r.Get("/api/user/export", exportH.Get)

		r.Get("/api/notifications/prefs", notifH.Get)
		r.Patch("/api/notifications/prefs", notifH.Update)

		r.Get("/api/score", checkinH.GetScoreCard)
		r.Post("/api/checkins", checkinH.Upsert)
		r.Get("/api/checkins", checkinH.List)

		r.Get("/api/insights", insightH.Get)
		r.Post("/api/insights/dismiss", insightH.DismissComponent)

		r.Get("/api/follow-ups", followUpH.GetToday)
		r.Post("/api/follow-ups/{id}/dismiss", followUpH.Dismiss)
	})

	return r
}

// corsMiddleware adds CORS headers to every response and handles OPTIONS preflight.
func corsMiddleware(origin string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
			w.Header().Set("Access-Control-Max-Age", "86400")
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// healthHandler returns a handler that checks the DB pool and reports uptime.
func healthHandler(pool *pgxpool.Pool, start time.Time) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		dbStatus := "ok"
		httpStatus := http.StatusOK
		if pool != nil {
			if err := pool.Ping(r.Context()); err != nil {
				dbStatus = "unreachable"
				httpStatus = http.StatusServiceUnavailable
			}
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(httpStatus)
		json.NewEncoder(w).Encode(map[string]any{
			"status":         func() string { if httpStatus == http.StatusOK { return "ok" }; return "degraded" }(),
			"db":             dbStatus,
			"uptime_seconds": math.Round(time.Since(start).Seconds()),
		})
	}
}
