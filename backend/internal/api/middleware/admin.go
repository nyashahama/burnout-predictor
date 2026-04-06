package middleware

import (
	"context"
	"net/http"
	"strings"

	"github.com/nyasha-hama/burnout-predictor-api/internal/api/respond"
)

type adminContextKeyType string

const adminContextKey adminContextKeyType = "is_admin"

// Admin returns a middleware that checks if the authenticated user is an admin.
// If no adminEmails are configured, the middleware allows all requests through.
// When configured, only users with matching emails are treated as admins.
func Admin(adminEmails ...string) func(http.Handler) http.Handler {
	// If no admin emails configured, allow all (dev mode)
	if len(adminEmails) == 0 {
		return func(next http.Handler) http.Handler {
			return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				ctx := context.WithValue(r.Context(), adminContextKey, true)
				next.ServeHTTP(w, r.WithContext(ctx))
			})
		}
	}

	// Build lowercase email set for O(1) lookup
	adminSet := make(map[string]struct{}, len(adminEmails))
	for _, e := range adminEmails {
		adminSet[strings.ToLower(e)] = struct{}{}
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			user := UserFromCtx(r.Context())
			if user.Email == "" {
				respond.Error(w, http.StatusUnauthorized, "authentication required")
				return
			}

			_, isAdmin := adminSet[strings.ToLower(user.Email)]
			if !isAdmin {
				respond.Error(w, http.StatusForbidden, "admin access required")
				return
			}

			ctx := context.WithValue(r.Context(), adminContextKey, true)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// IsAdminFromCtx returns whether the current request is an admin.
func IsAdminFromCtx(ctx context.Context) bool {
	isAdmin, _ := ctx.Value(adminContextKey).(bool)
	return isAdmin
}
