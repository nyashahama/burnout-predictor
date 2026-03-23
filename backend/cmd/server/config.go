package main

import (
	"log/slog"
	"os"
)

// Config holds all configuration loaded from environment variables.
type Config struct {
	DatabaseURL  string
	JWTSecret    string
	Port         string
	ResendAPIKey string
	EmailFrom    string
	AIAPIKey string
	PaddleSecret string
	AppURL       string
	CORSOrigin   string
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}

// Load reads configuration from environment variables. Fatal if required vars are missing.
func Load() Config {
	cfg := Config{
		DatabaseURL:  os.Getenv("DATABASE_URL"),
		JWTSecret:    os.Getenv("JWT_SECRET"),
		Port:         os.Getenv("PORT"),
		ResendAPIKey: os.Getenv("RESEND_API_KEY"),
		EmailFrom:    os.Getenv("EMAIL_FROM"),
		AIAPIKey: firstNonEmpty(os.Getenv("DEEPSEEK_API_KEY"), os.Getenv("OPENAI_API_KEY")),
		PaddleSecret: os.Getenv("PADDLE_WEBHOOK_SECRET"),
		AppURL:       os.Getenv("APP_URL"),
		CORSOrigin:   os.Getenv("CORS_ORIGIN"),
	}
	if cfg.DatabaseURL == "" {
		slog.Default().Error("DATABASE_URL is required")
		os.Exit(1)
	}
	if len(cfg.JWTSecret) < 32 {
		slog.Default().Error("JWT_SECRET must be at least 32 characters")
		os.Exit(1)
	}
	if cfg.Port == "" {
		cfg.Port = "8080"
	}
	if cfg.EmailFrom == "" {
		cfg.EmailFrom = "Overload <noreply@overload.app>"
	}
	if cfg.AppURL == "" {
		cfg.AppURL = "https://overload.app"
	}
	return cfg
}
