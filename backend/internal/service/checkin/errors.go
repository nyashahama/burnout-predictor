package checkin

import "net/http"

type checkinError struct {
	msg    string
	status int
}

func (e checkinError) Error() string   { return e.msg }
func (e checkinError) HTTPStatus() int { return e.status }

var (
	ErrInvalidStress = checkinError{"stress must be 1-5", http.StatusBadRequest}
)
