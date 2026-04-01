package main

import "testing"

func TestLoad_UsesLocalhostCorsOriginInDevelopment(t *testing.T) {
	cfg, err := load(func(key string) string {
		switch key {
		case "DATABASE_URL":
			return "postgres://user:password@localhost:5432/burnout_predictor"
		case "JWT_SECRET":
			return "12345678901234567890123456789012"
		case "APP_ENV":
			return "development"
		default:
			return ""
		}
	})
	if err != nil {
		t.Fatalf("load() error = %v, want nil", err)
	}
	if cfg.CORSOrigin != "http://localhost:3000" {
		t.Fatalf("CORSOrigin = %q, want localhost dev default", cfg.CORSOrigin)
	}
}

func TestLoad_RequiresCorsOriginOutsideDevelopment(t *testing.T) {
	_, err := load(func(key string) string {
		switch key {
		case "DATABASE_URL":
			return "postgres://user:password@localhost:5432/burnout_predictor"
		case "JWT_SECRET":
			return "12345678901234567890123456789012"
		case "APP_ENV":
			return "production"
		default:
			return ""
		}
	})
	if err == nil {
		t.Fatal("load() error = nil, want missing CORS_ORIGIN error")
	}
}
