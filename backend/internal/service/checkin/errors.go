package checkin

import "errors"

var (
	ErrInvalidStress = errors.New("stress must be 1-5")
)
