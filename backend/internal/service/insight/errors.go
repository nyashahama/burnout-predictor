package insight

import "net/http"

type insightError struct {
	msg    string
	status int
}

func (e insightError) Error() string   { return e.msg }
func (e insightError) HTTPStatus() int { return e.status }

var (
	ErrInvalidComponent = insightError{"component_key is required", http.StatusBadRequest}
)
