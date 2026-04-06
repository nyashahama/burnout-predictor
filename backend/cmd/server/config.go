package main

import (
	"fmt"
	"log/slog"
	"os"
	"strings"
)

// Config holds all configuration loaded from environment variables.
type Config struct {
	Environment  string
	DatabaseURL  string
	JWTSecret    string
	Port         string
	ResendAPIKey string
	EmailFrom    string
	AIAPIKey     string
	PaddleSecret string
	AppURL       string
	CORSOrigin   string
	AdminEmails  []string
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}

func splitAndTrim(s, sep string) []string {
	result := make([]string, 0)
	for _, part := range strings.Split(s, sep) {
		result = append(result, strings.TrimSpace(part))
	}
	return result
}

func load(getenv func(string) string) (Config, error) {
	adminEnv := getenv("ADMIN_EMAILS")
	var adminEmails []string
	if adminEnv != "" {
		for _, e := range splitAndTrim(adminEnv, ",") {
			if e != "" {
				adminEmails = append(adminEmails, e)
			}
		}
	}

	cfg := Config{
		Environment:  firstNonEmpty(getenv("APP_ENV"), "development"),
		DatabaseURL:  getenv("DATABASE_URL"),
		JWTSecret:    getenv("JWT_SECRET"),
		Port:         getenv("PORT"),
		ResendAPIKey: getenv("RESEND_API_KEY"),
		EmailFrom:    getenv("EMAIL_FROM"),
		AIAPIKey:     firstNonEmpty(getenv("DEEPSEEK_API_KEY"), getenv("OPENAI_API_KEY")),
		PaddleSecret: getenv("PADDLE_WEBHOOK_SECRET"),
		AppURL:       getenv("APP_URL"),
		CORSOrigin:   getenv("CORS_ORIGIN"),
		AdminEmails:  adminEmails,
	}
	if cfg.DatabaseURL == "" {
		return Config{}, fmt.Errorf("DATABASE_URL is required")
	}
	if len(cfg.JWTSecret) < 32 {
		return Config{}, fmt.Errorf("JWT_SECRET must be at least 32 characters")
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
	if cfg.CORSOrigin == "" {
		if cfg.Environment == "development" || cfg.Environment == "test" {
			cfg.CORSOrigin = "http://localhost:3000"
		} else {
			return Config{}, fmt.Errorf("CORS_ORIGIN is required when APP_ENV is %q", cfg.Environment)
		}
	}
	return cfg, nil
}

// Load reads configuration from environment variables. Fatal if required vars are missing.
func Load() Config {
	cfg, err := load(os.Getenv)
	if err != nil {
		slog.Default().Error(err.Error())
		os.Exit(1)
	}
	return cfg
}
