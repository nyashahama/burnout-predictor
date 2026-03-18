package api

import (
	"net/http"
	"sync"
	"time"
)

// rateLimiter is a simple in-memory fixed-window rate limiter keyed by IP address.
// Suitable for single-instance deployments (MVP). For multi-instance deployments,
// replace with a Redis-backed implementation.
type rateLimiter struct {
	mu      sync.Mutex
	windows map[string]*rlWindow
	max     int
	period  time.Duration
}

type rlWindow struct {
	count    int
	resetAt  time.Time
}

func newRateLimiter(max int, period time.Duration) *rateLimiter {
	rl := &rateLimiter{
		windows: make(map[string]*rlWindow),
		max:     max,
		period:  period,
	}
	// Background cleanup to prevent unbounded memory growth.
	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			rl.cleanup()
		}
	}()
	return rl
}

// allow returns true if the request should be allowed, false if rate limited.
func (rl *rateLimiter) allow(ip string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	w, ok := rl.windows[ip]
	if !ok || now.After(w.resetAt) {
		rl.windows[ip] = &rlWindow{count: 1, resetAt: now.Add(rl.period)}
		return true
	}
	if w.count >= rl.max {
		return false
	}
	w.count++
	return true
}

func (rl *rateLimiter) cleanup() {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	now := time.Now()
	for k, w := range rl.windows {
		if now.After(w.resetAt) {
			delete(rl.windows, k)
		}
	}
}

// RateLimit returns a Chi middleware that limits requests per IP.
// max is the number of requests allowed per window duration.
func RateLimit(max int, window time.Duration) func(http.Handler) http.Handler {
	rl := newRateLimiter(max, window)
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ip := realIP(r)
			if !rl.allow(ip) {
				writeError(w, http.StatusTooManyRequests, "too many requests — try again in a minute")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// realIP extracts the client IP, respecting X-Forwarded-For from trusted proxies.
func realIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		// Take the first (leftmost) address which is the original client.
		for i := 0; i < len(xff); i++ {
			if xff[i] == ',' {
				return xff[:i]
			}
		}
		return xff
	}
	if xri := r.Header.Get("X-Real-IP"); xri != "" {
		return xri
	}
	// Strip port from RemoteAddr.
	addr := r.RemoteAddr
	for i := len(addr) - 1; i >= 0; i-- {
		if addr[i] == ':' {
			return addr[:i]
		}
	}
	return addr
}
