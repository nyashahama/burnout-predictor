package middleware

import (
	"net/http"
	"sync"
	"time"

	"github.com/nyasha-hama/burnout-predictor-api/internal/api/respond"
)

type rateLimiter struct {
	mu      sync.Mutex
	windows map[string]*rlWindow
	max     int
	period  time.Duration
}

type rlWindow struct {
	count   int
	resetAt time.Time
}

func newRateLimiter(max int, period time.Duration) *rateLimiter {
	rl := &rateLimiter{
		windows: make(map[string]*rlWindow),
		max:     max,
		period:  period,
	}
	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			rl.cleanup()
		}
	}()
	return rl
}

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
func RateLimit(max int, window time.Duration) func(http.Handler) http.Handler {
	rl := newRateLimiter(max, window)
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !rl.allow(realIP(r)) {
				respond.Error(w, http.StatusTooManyRequests, "too many requests — try again in a minute")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func realIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
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
	addr := r.RemoteAddr
	for i := len(addr) - 1; i >= 0; i-- {
		if addr[i] == ':' {
			return addr[:i]
		}
	}
	return addr
}
