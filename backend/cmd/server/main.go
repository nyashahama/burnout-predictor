package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"

	"github.com/nyasha-hama/burnout-predictor-api/internal/ai"
	"github.com/nyasha-hama/burnout-predictor-api/internal/api"
	db "github.com/nyasha-hama/burnout-predictor-api/internal/db/sqlc"
	"github.com/nyasha-hama/burnout-predictor-api/internal/email"
	notificationsvc "github.com/nyasha-hama/burnout-predictor-api/internal/service/notification"
	"github.com/nyasha-hama/burnout-predictor-api/internal/store"
	"github.com/nyasha-hama/burnout-predictor-api/internal/worker"
)

func main() {
	_ = godotenv.Load()

	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(logger)

	cfg := Load()

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
	defer stop()

	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		slog.Default().Error("connect db", "err", err)
		os.Exit(1)
	}
	defer pool.Close()
	if err := pool.Ping(ctx); err != nil {
		slog.Default().Error("ping db", "err", err)
		os.Exit(1)
	}

	var emailClient *email.Client
	if cfg.ResendAPIKey != "" {
		emailClient = email.New(cfg.ResendAPIKey, cfg.EmailFrom)
		slog.Default().Info("email enabled", "provider", "resend")
	} else {
		slog.Default().Info("email disabled")
	}

	var aiClient *ai.Client
	if cfg.AIAPIKey != "" {
		aiClient = ai.New(cfg.AIAPIKey)
		slog.Default().Info("ai enabled", "provider", "deepseek")
	} else {
		slog.Default().Info("ai disabled")
	}

	if cfg.PaddleSecret == "" {
		slog.Default().Warn("paddle webhook signature check disabled")
	}

	startTime := time.Now()
	queries := db.New(pool)
	pg := store.New(queries)

	notifSvc := notificationsvc.New(pg, emailClient, aiClient, logger)
	go worker.Run(ctx, logger, notifSvc)

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       120 * time.Second,
		Handler: api.NewServer(ctx, api.ServerConfig{
			Queries:      queries,
			Pool:         pool,
			JWTSecret:    cfg.JWTSecret,
			EmailClient:  emailClient,
			AIClient:     aiClient,
			PaddleSecret: cfg.PaddleSecret,
			AppURL:       cfg.AppURL,
			CORSOrigin:   cfg.CORSOrigin,
			StartTime:    startTime,
			Logger:       logger,
		}),
	}

	go func() {
		slog.Default().Info("listening", "port", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Default().Error("listen", "err", err)
			os.Exit(1)
		}
	}()

	<-ctx.Done()
	slog.Default().Info("shutting down")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		slog.Default().Error("shutdown", "err", err)
	}
	slog.Default().Info("server stopped")
}
