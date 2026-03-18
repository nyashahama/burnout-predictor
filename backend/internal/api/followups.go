package api

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	db "github.com/nyasha-hama/burnout-predictor-api/internal/db/sqlc"
)

// GetTodayFollowUp handles GET /api/follow-ups.
// Returns the single active follow-up for today in the user's timezone, if any.
// Also marks it as surfaced (shown to user) on first retrieval.
func (h *Handler) GetTodayFollowUp(w http.ResponseWriter, r *http.Request) {
	user := userFromCtx(r.Context())
	today := localDate(user.Timezone)

	fu, err := h.q.GetTodayFollowUp(r.Context(), db.GetTodayFollowUpParams{
		UserID:   user.ID,
		FireDate: pgtype.Date{Time: today, Valid: true},
	})
	if err != nil {
		// No follow-up today — return null rather than an error.
		writeJSON(w, http.StatusOK, map[string]interface{}{"follow_up": nil})
		return
	}

	// Mark as surfaced on first view.
	if !fu.SurfacedAt.Valid {
		_ = h.q.MarkFollowUpSurfaced(r.Context(), db.MarkFollowUpSurfacedParams{
			ID:     fu.ID,
			UserID: user.ID,
		})
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"follow_up": fu})
}

// DismissFollowUp handles POST /api/follow-ups/{id}/dismiss.
func (h *Handler) DismissFollowUp(w http.ResponseWriter, r *http.Request) {
	user := userFromCtx(r.Context())
	idStr := chi.URLParam(r, "id")

	fuID, err := uuid.Parse(idStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid follow-up id")
		return
	}

	if err := h.q.DismissFollowUp(r.Context(), db.DismissFollowUpParams{
		ID:     fuID,
		UserID: user.ID,
	}); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to dismiss follow-up")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "dismissed"})
}

// ── Follow-up note parser ─────────────────────────────────────────────────────

// followUpRule maps note keywords to a follow-up event type and question.
type followUpRule struct {
	keywords  []string
	eventType string
	question  string
}

var followUpRules = []followUpRule{
	{
		keywords:  []string{"deadline", "due", "submit", "deliver", "launch"},
		eventType: "deadline",
		question:  "How did the deadline go? Was it as stressful as you expected?",
	},
	{
		keywords:  []string{"presentation", "present", "demo", "pitch"},
		eventType: "presentation",
		question:  "How did the presentation go? Did it land the way you wanted?",
	},
	{
		keywords:  []string{"interview", "interviewing"},
		eventType: "interview",
		question:  "How did the interview go? Feeling okay about it?",
	},
	{
		keywords:  []string{"travel", "flight", "trip", "fly", "conference"},
		eventType: "travel",
		question:  "How was the travel? Did being away affect your load?",
	},
	{
		keywords:  []string{"big meeting", "all-hands", "board", "review meeting"},
		eventType: "meeting",
		question:  "How did the big meeting go? Anything worth reflecting on?",
	},
	{
		keywords:  []string{"surgery", "procedure", "hospital"},
		eventType: "medical",
		question:  "How are you doing after the medical appointment? Hope it went okay.",
	},
}

// scheduleFollowUps parses a note for future-facing events and creates follow-up
// records (fire_date = today + 1). Called asynchronously after a check-in is saved.
func (h *Handler) scheduleFollowUps(checkinID uuid.UUID, userID uuid.UUID, note string, today time.Time) {
	if note == "" {
		return
	}

	lower := strings.ToLower(note)
	fireDate := today.AddDate(0, 0, 1)

	for _, rule := range followUpRules {
		matched := false
		snippet := ""
		for _, kw := range rule.keywords {
			if strings.Contains(lower, kw) {
				matched = true
				snippet = extractSnippet(note, kw)
				break
			}
		}
		if !matched {
			continue
		}

		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		_, err := h.q.CreateFollowUp(ctx, db.CreateFollowUpParams{
			UserID:          userID,
			FireDate:        pgtype.Date{Time: fireDate, Valid: true},
			EventType:       rule.eventType,
			Question:        rule.question,
			NoteSnippet:     pgtype.Text{String: snippet, Valid: snippet != ""},
			SourceCheckinID: pgtype.UUID{Bytes: checkinID, Valid: true},
		})
		cancel()
		if err != nil {
			log.Printf("api/followups: create for %s: %v", userID, err)
		}
		// Only create one follow-up per day per user (enforced by unique constraint).
		break
	}
}

// extractSnippet returns a short excerpt from the note around the matched keyword.
func extractSnippet(note, keyword string) string {
	lower := strings.ToLower(note)
	idx := strings.Index(lower, strings.ToLower(keyword))
	if idx < 0 {
		return note
	}
	start := idx - 20
	if start < 0 {
		start = 0
	}
	end := idx + len(keyword) + 40
	if end > len(note) {
		end = len(note)
	}
	snippet := strings.TrimSpace(note[start:end])
	if start > 0 {
		snippet = "…" + snippet
	}
	if end < len(note) {
		snippet = snippet + "…"
	}
	return snippet
}

// DismissComponent handles POST /api/insights/dismiss.
// Persists a UI component dismissal cross-device.
func (h *Handler) DismissComponent(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ComponentKey string `json:"component_key"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.ComponentKey == "" {
		writeError(w, http.StatusBadRequest, "component_key is required")
		return
	}

	user := userFromCtx(r.Context())
	if err := h.q.DismissComponent(r.Context(), db.DismissComponentParams{
		UserID:       user.ID,
		ComponentKey: req.ComponentKey,
	}); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to save dismissal")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "dismissed"})
}
