package payment

import "errors"

var (
	ErrPaymentNotFound       = errors.New("payment not found")
	ErrPaymentExpired        = errors.New("payment reference has expired")
	ErrPaymentAlreadyUsed    = errors.New("payment reference already used")
	ErrInvalidPlan           = errors.New("invalid plan name")
	ErrUnauthorized          = errors.New("unauthorized")
	ErrUserAlreadySubscribed = errors.New("user already has active subscription")
)
