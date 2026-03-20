package auth

import "errors"

var (
	ErrEmailInUse           = errors.New("email already in use")
	ErrInvalidCredentials   = errors.New("invalid credentials")
	ErrInvalidToken         = errors.New("invalid or expired token")
	ErrEmailAlreadyVerified = errors.New("email already verified")
	ErrEmailServiceDisabled = errors.New("email service unavailable")
)
