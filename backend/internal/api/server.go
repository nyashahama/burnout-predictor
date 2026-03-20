package api

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"

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
	Queries       *db.Queries
	JWTSecret     string
	EmailClient   *eml.Client
	AIClient      *ai.Client
	PaddleSecret  string
	AppURL        string
}

// NewServer builds and returns the chi router wired up with all handlers.
func NewServer(cfg ServerConfig) http.Handler {
	pg := store.New(cfg.Queries)

	authService := authsvc.New(pg, []byte(cfg.JWTSecret), cfg.EmailClient, cfg.AppURL)
	checkinService := checkinsvc.New(pg, cfg.AIClient)
	insightService := insightsvc.New(pg)
	billingService := billingsvc.New(pg)

	authH := handler.NewAuthHandler(authService)
	checkinH := handler.NewCheckinHandler(checkinService)
	insightH := handler.NewInsightHandler(insightService)
	followUpH := handler.NewFollowUpHandler(pg)
	userH := handler.NewUserHandler(authService)
	webhookH := handler.NewWebhookHandler(billingService, []byte(cfg.PaddleSecret))

	secret := authService.JWTSecret()
	authMW := middleware.Auth(pg, secret)

	r := chi.NewRouter()
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)
	r.Use(chimw.Timeout(30 * time.Second))

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
