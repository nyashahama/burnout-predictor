package main

import (
	"log"
	"os"
)

// Config holds all configuration loaded from environment variables.
type Config struct {
	DatabaseURL   string
	JWTSecret     string
	Port          string
	ResendAPIKey  string
	EmailFrom     string
	OpenAIAPIKey  string
	PaddleSecret  string
	AppURL        string
}

// Load reads configuration from environment variables. Fatal if required vars are missing.
func Load() Config {
	cfg := Config{
		DatabaseURL:  os.Getenv("DATABASE_URL"),
		JWTSecret:    os.Getenv("JWT_SECRET"),
		Port:         os.Getenv("PORT"),
		ResendAPIKey: os.Getenv("RESEND_API_KEY"),
		EmailFrom:    os.Getenv("EMAIL_FROM"),
		OpenAIAPIKey: os.Getenv("OPENAI_API_KEY"),
		PaddleSecret: os.Getenv("PADDLE_WEBHOOK_SECRET"),
		AppURL:       os.Getenv("APP_URL"),
	}
	if cfg.DatabaseURL == "" {
		log.Fatal("DATABASE_URL is required")
	}
	if cfg.JWTSecret == "" {
		log.Fatal("JWT_SECRET is required")
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
