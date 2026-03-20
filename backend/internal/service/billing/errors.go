package billing

import "errors"

var (
	ErrEventAlreadyProcessed = errors.New("event already processed")
)
