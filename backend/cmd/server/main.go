package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/nyasha-hama/burnout-predictor-api/internal/api"
	db "github.com/nyasha-hama/burnout-predictor-api/internal/db/sqlc"
)

func main() {
	ctx := context.Background()

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

	queries := db.New(pool)
	h := api.NewHandler(queries, jwtSecret)

	r := chi.NewRouter()
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)
	r.Use(chimw.Timeout(30 * time.Second))

	// Public auth routes
	r.Post("/api/auth/register", h.Register)
	r.Post("/api/auth/login", h.Login)
	r.Post("/api/auth/refresh", h.RefreshToken)

	// Authenticated routes
	r.Group(func(r chi.Router) {
		r.Use(h.AuthMiddleware)

		r.Post("/api/auth/logout", h.Logout)

		r.Get("/api/user", h.GetProfile)
		r.Patch("/api/user", h.UpdateProfile)

		r.Get("/api/score", h.GetScore)
		r.Post("/api/checkins", h.UpsertCheckIn)
		r.Get("/api/checkins", h.ListCheckIns)

		r.Get("/api/insights", h.GetInsights)
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("listening on :%s", port)
	if err := http.ListenAndServe(":"+port, r); err != nil {
		log.Fatal(err)
	}
}
