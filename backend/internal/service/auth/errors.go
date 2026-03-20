package auth

import "net/http"

type authError struct {
	msg    string
	status int
}

func (e authError) Error() string   { return e.msg }
func (e authError) HTTPStatus() int { return e.status }

var (
	ErrEmailInUse           = authError{"email already in use", http.StatusConflict}
	ErrInvalidCredentials   = authError{"invalid credentials", http.StatusUnauthorized}
	ErrInvalidToken         = authError{"invalid or expired token", http.StatusBadRequest}
	ErrEmailAlreadyVerified = authError{"email already verified", http.StatusConflict}
	ErrEmailServiceDisabled = authError{"email service unavailable", http.StatusServiceUnavailable}
)
