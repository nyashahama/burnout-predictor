package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/nyasha-hama/burnout-predictor-api/internal/ai"
	"github.com/nyasha-hama/burnout-predictor-api/internal/api"
	db "github.com/nyasha-hama/burnout-predictor-api/internal/db/sqlc"
	"github.com/nyasha-hama/burnout-predictor-api/internal/email"
	"github.com/nyasha-hama/burnout-predictor-api/internal/workers"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
	defer stop()

	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		log.Fatal("DATABASE_URL is required")
	}
	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		log.Fatal("JWT_SECRET is required")
	}

	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		log.Fatalf("connect db: %v", err)
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		log.Fatalf("ping db: %v", err)
	}

	// Optional: email (Resend). Disabled if RESEND_API_KEY is not set.
	var emailClient *email.Client
	if resendKey := os.Getenv("RESEND_API_KEY"); resendKey != "" {
		from := os.Getenv("EMAIL_FROM")
		if from == "" {
			from = "Overload <noreply@overload.app>"
		}
		emailClient = email.New(resendKey, from)
		log.Println("email: Resend enabled")
	} else {
		log.Println("email: disabled (RESEND_API_KEY not set)")
	}

	// Optional: AI (OpenAI). Disabled if OPENAI_API_KEY is not set.
	var aiClient *ai.Client
	if openAIKey := os.Getenv("OPENAI_API_KEY"); openAIKey != "" {
		aiClient = ai.New(openAIKey)
		log.Println("ai: OpenAI enabled")
	} else {
		log.Println("ai: disabled (OPENAI_API_KEY not set)")
	}

	// Optional: Paddle webhook signature verification.
	paddleSecret := os.Getenv("PADDLE_WEBHOOK_SECRET")
	if paddleSecret == "" {
		log.Println("paddle: webhook signature check disabled (PADDLE_WEBHOOK_SECRET not set)")
	}

	// Frontend URL used in email links.
	appURL := os.Getenv("APP_URL")
	if appURL == "" {
		appURL = "https://overload.app"
	}

	queries := db.New(pool)
	h := api.NewHandler(queries, jwtSecret, emailClient, aiClient, paddleSecret, appURL)

	// ── Background workers ────────────────────────────────────────────────────
	notifier := workers.New(queries, emailClient, aiClient)
	go func() {
		minuteTicker := time.NewTicker(60 * time.Second)
		aiTicker := time.NewTicker(5 * time.Minute)
		hourlyTicker := time.NewTicker(time.Hour)
		defer minuteTicker.Stop()
		defer aiTicker.Stop()
		defer hourlyTicker.Stop()
		for {
			select {
			case <-minuteTicker.C:
				notifier.RunMinutely(ctx)
			case <-aiTicker.C:
				notifier.RunAIPlans(ctx)
			case <-hourlyTicker.C:
				notifier.RunHourly(ctx)
			case <-ctx.Done():
				return
			}
		}
	}()

	// ── Router ────────────────────────────────────────────────────────────────
	r := chi.NewRouter()
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)
	r.Use(chimw.Timeout(30 * time.Second))

	// Public webhook (no JWT — authenticated by Paddle-Signature header).
	r.Post("/api/webhooks/paddle", h.PaddleWebhook)

	// Public auth routes with per-IP rate limiting.
	r.Group(func(r chi.Router) {
		r.Use(api.RateLimit(20, time.Minute)) // 20 req/min per IP
		r.Post("/api/auth/register", h.Register)
		r.Post("/api/auth/login", h.Login)
		r.Post("/api/auth/refresh", h.RefreshToken)
		r.Post("/api/auth/forgot-password", h.ForgotPassword)
		r.Post("/api/auth/reset-password", h.ResetPassword)
		r.Post("/api/auth/verify-email", h.VerifyEmail)
	})

	// Authenticated routes.
	r.Group(func(r chi.Router) {
		r.Use(h.AuthMiddleware)

		r.Post("/api/auth/logout", h.Logout)
		r.Post("/api/auth/resend-verification", h.ResendVerification)

		r.Get("/api/user", h.GetProfile)
		r.Patch("/api/user", h.UpdateProfile)

		r.Get("/api/score", h.GetScore)
		r.Post("/api/checkins", h.UpsertCheckIn)
		r.Get("/api/checkins", h.ListCheckIns)

		r.Get("/api/insights", h.GetInsights)
		r.Post("/api/insights/dismiss", h.DismissComponent)

		r.Get("/api/follow-ups", h.GetTodayFollowUp)
		r.Post("/api/follow-ups/{id}/dismiss", h.DismissFollowUp)
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	srv := &http.Server{
		Addr:    ":" + port,
		Handler: r,
	}

	// Start server in a goroutine so we can listen for shutdown signals.
	go func() {
		log.Printf("listening on :%s", port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("listen: %v", err)
		}
	}()

	// Block until SIGTERM or SIGINT.
	<-ctx.Done()
	log.Println("shutting down — draining in-flight requests (30s timeout)")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("shutdown error: %v", err)
	}
	log.Println("server stopped cleanly")
}
