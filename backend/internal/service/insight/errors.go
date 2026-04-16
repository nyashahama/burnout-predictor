package insight

import "net/http"

type insightError struct {
	msg    string
	status int
}

func (e insightError) Error() string   { return e.msg }
func (e insightError) HTTPStatus() int { return e.status }

var (
	ErrInvalidComponent          = insightError{"component_key is required", http.StatusBadRequest}
	ErrRecommendationUnavailable = insightError{"no current recommendation available to commit", http.StatusConflict}
	ErrActiveCommitmentExists    = insightError{"an active recommendation commitment already exists", http.StatusConflict}
	ErrCommitmentNotFound        = insightError{"recommendation commitment not found", http.StatusNotFound}
	ErrInvalidCommitmentState    = insightError{"invalid recommendation commitment state transition", http.StatusConflict}
)
