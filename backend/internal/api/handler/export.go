package handler

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/google/uuid"

	db "github.com/nyasha-hama/burnout-predictor-api/internal/db/sqlc"
	"github.com/nyasha-hama/burnout-predictor-api/internal/api/middleware"
	"github.com/nyasha-hama/burnout-predictor-api/internal/api/respond"
	authsvc "github.com/nyasha-hama/burnout-predictor-api/internal/service/auth"
)

type exportStore interface {
	ExportUserCheckIns(ctx context.Context, userID uuid.UUID) ([]db.ExportUserCheckInsRow, error)
}

type exportUserService interface {
	GetProfile(ctx context.Context, user db.User) authsvc.UserResponse
}

type exportCheckIn struct {
	Date  string `json:"date"`
	Stress int16  `json:"stress"`
	Score  int16  `json:"score"`
	Note   string `json:"note,omitempty"`
}

type exportResponse struct {
	User      exportUser      `json:"user"`
	CheckIns  []exportCheckIn `json:"check_ins"`
	ExportedAt time.Time      `json:"exported_at"`
}

type exportUser struct {
	Email string `json:"email"`
	Name  string `json:"name"`
	Role  string `json:"role"`
}

// ExportHandler handles GET /api/user/export.
type ExportHandler struct {
	store exportStore
}

func NewExportHandler(store exportStore) *ExportHandler {
	return &ExportHandler{store: store}
}

func (h *ExportHandler) Get(w http.ResponseWriter, r *http.Request) {
	user := middleware.UserFromCtx(r.Context())

	rows, err := h.store.ExportUserCheckIns(r.Context(), user.ID)
	if err != nil {
		respond.Error(w, http.StatusInternalServerError, "failed to export data")
		return
	}

	checkIns := make([]exportCheckIn, len(rows))
	for i, row := range rows {
		note := ""
		if row.Note.Valid {
			note = row.Note.String
		}
		checkIns[i] = exportCheckIn{
			Date:   row.CheckedInDate.Time.Format("2006-01-02"),
			Stress: row.Stress,
			Score:  row.Score,
			Note:   note,
		}
	}

	payload := exportResponse{
		User: exportUser{
			Email: user.Email,
			Name:  user.Name,
			Role:  user.Role,
		},
		CheckIns:   checkIns,
		ExportedAt: time.Now().UTC(),
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Content-Disposition", `attachment; filename="overload-export.json"`)
	w.WriteHeader(http.StatusOK)
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		slog.Default().ErrorContext(r.Context(), "export: encode response failed", "err", err)
	}
}
