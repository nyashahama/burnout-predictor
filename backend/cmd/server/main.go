package main

import (
	"context"
	"log"
	"net/http"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/nyasha-hama/burnout-predictor-api/internal/ai"
	"github.com/nyasha-hama/burnout-predictor-api/internal/api"
	db "github.com/nyasha-hama/burnout-predictor-api/internal/db/sqlc"
	"github.com/nyasha-hama/burnout-predictor-api/internal/email"
	notificationsvc "github.com/nyasha-hama/burnout-predictor-api/internal/service/notification"
	"github.com/nyasha-hama/burnout-predictor-api/internal/store"
	"github.com/nyasha-hama/burnout-predictor-api/internal/worker"
)

func main() {
	cfg := Load()

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
	defer stop()

	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("connect db: %v", err)
	}
	defer pool.Close()
	if err := pool.Ping(ctx); err != nil {
		log.Fatalf("ping db: %v", err)
	}

	var emailClient *email.Client
	if cfg.ResendAPIKey != "" {
		emailClient = email.New(cfg.ResendAPIKey, cfg.EmailFrom)
		log.Println("email: Resend enabled")
	} else {
		log.Println("email: disabled")
	}

	var aiClient *ai.Client
	if cfg.OpenAIAPIKey != "" {
		aiClient = ai.New(cfg.OpenAIAPIKey)
		log.Println("ai: OpenAI enabled")
	} else {
		log.Println("ai: disabled")
	}

	if cfg.PaddleSecret == "" {
		log.Println("paddle: webhook signature check disabled")
	}

	startTime := time.Now()
	queries := db.New(pool)
	pg := store.New(queries)

	notifSvc := notificationsvc.New(pg, emailClient, aiClient)
	go worker.Run(ctx, notifSvc)

	srv := &http.Server{
		Addr: ":" + cfg.Port,
		Handler: api.NewServer(api.ServerConfig{
			Queries:      queries,
			Pool:         pool,
			JWTSecret:    cfg.JWTSecret,
			EmailClient:  emailClient,
			AIClient:     aiClient,
			PaddleSecret: cfg.PaddleSecret,
			AppURL:       cfg.AppURL,
			CORSOrigin:   cfg.CORSOrigin,
			StartTime:    startTime,
		}),
	}

	go func() {
		log.Printf("listening on :%s", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("listen: %v", err)
		}
	}()

	<-ctx.Done()
	log.Println("shutting down")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("shutdown: %v", err)
	}
	log.Println("server stopped")
}
