// Package middleware provides HTTP middleware for the API.
package middleware

import (
	"context"
	"net/http"
	"strings"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"

	db "github.com/nyasha-hama/burnout-predictor-api/internal/db/sqlc"
	"github.com/nyasha-hama/burnout-predictor-api/internal/api/respond"
)

type contextKey string

const userContextKey contextKey = "user"

// userGetter is the minimal store interface needed by Auth middleware.
type userGetter interface {
	GetUserByID(ctx context.Context, id uuid.UUID) (db.User, error)
}

// Auth returns a middleware that validates the Bearer JWT and injects the
// authenticated db.User into the request context.
func Auth(store userGetter, secret []byte) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authHeader := r.Header.Get("Authorization")
			if !strings.HasPrefix(authHeader, "Bearer ") {
				respond.Error(w, http.StatusUnauthorized, "missing bearer token")
				return
			}
			tokenStr := strings.TrimPrefix(authHeader, "Bearer ")

			token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
				if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
					return nil, jwt.ErrSignatureInvalid
				}
				return secret, nil
			})
			if err != nil || !token.Valid {
				respond.Error(w, http.StatusUnauthorized, "invalid token")
				return
			}

			claims, ok := token.Claims.(jwt.MapClaims)
			if !ok {
				respond.Error(w, http.StatusUnauthorized, "invalid claims")
				return
			}
			sub, err := claims.GetSubject()
			if err != nil {
				respond.Error(w, http.StatusUnauthorized, "missing subject")
				return
			}
			userID, err := uuid.Parse(sub)
			if err != nil {
				respond.Error(w, http.StatusUnauthorized, "invalid subject")
				return
			}

			user, err := store.GetUserByID(r.Context(), userID)
			if err != nil {
				respond.Error(w, http.StatusUnauthorized, "user not found")
				return
			}

			ctx := context.WithValue(r.Context(), userContextKey, user)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// UserFromCtx extracts the authenticated user from the request context.
func UserFromCtx(ctx context.Context) db.User {
	return ctx.Value(userContextKey).(db.User)
}

// SetUserInCtx stores a user in context — mirrors what the Auth middleware does.
// Used by handler tests to simulate an authenticated request without running JWT validation.
func SetUserInCtx(ctx context.Context, user db.User) context.Context {
	return context.WithValue(ctx, userContextKey, user)
}
