package handler_test

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/nyasha-hama/burnout-predictor-api/internal/api/handler"
	db "github.com/nyasha-hama/burnout-predictor-api/internal/db/sqlc"
	insightsvc "github.com/nyasha-hama/burnout-predictor-api/internal/service/insight"
)

// ── mock ──────────────────────────────────────────────────────────────────────

type mockInsightService struct {
	GetFn              func(context.Context, db.User) (insightsvc.InsightBundle, error)
	DismissComponentFn func(context.Context, uuid.UUID, insightsvc.DismissRequest) error
}

func (m *mockInsightService) Get(ctx context.Context, user db.User) (insightsvc.InsightBundle, error) {
	if m.GetFn != nil {
		return m.GetFn(ctx, user)
	}
	return insightsvc.InsightBundle{}, nil
}
func (m *mockInsightService) DismissComponent(ctx context.Context, userID uuid.UUID, req insightsvc.DismissRequest) error {
	if m.DismissComponentFn != nil {
		return m.DismissComponentFn(ctx, userID, req)
	}
	return nil
}

// ── Get ───────────────────────────────────────────────────────────────────────

func TestInsightHandler_Get_ServiceError(t *testing.T) {
	h := handler.NewInsightHandler(&mockInsightService{
		GetFn: func(_ context.Context, _ db.User) (insightsvc.InsightBundle, error) {
			return insightsvc.InsightBundle{}, errors.New("db error")
		},
	})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req = withUser(req, testUser)
	h.Get(rec, req)
	if rec.Code != http.StatusInternalServerError {
		t.Errorf("got %d, want 500", rec.Code)
	}
}

func TestInsightHandler_Get_Success(t *testing.T) {
	h := handler.NewInsightHandler(&mockInsightService{})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req = withUser(req, testUser)
	h.Get(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("got %d, want 200", rec.Code)
	}
}

func TestInsightHandler_Get_SerializesActiveCommitmentAndOutcomePrompt(t *testing.T) {
	h := handler.NewInsightHandler(&mockInsightService{
		GetFn: func(_ context.Context, _ db.User) (insightsvc.InsightBundle, error) {
			return insightsvc.InsightBundle{
				ActiveCommitment: &insightsvc.RecommendationCommitment{
					ID:                  uuid.MustParse("44444444-4444-4444-4444-444444444444"),
					RecommendationTitle: "Protect a 90-minute focus block tomorrow morning",
					Status:              insightsvc.CommitmentStatusCommitted,
				},
				PendingOutcomePrompt: &insightsvc.PendingOutcomePrompt{
					CommitmentID:        uuid.MustParse("55555555-5555-5555-5555-555555555555"),
					RecommendationTitle: "End work by 6 PM tonight",
					Prompt:              "Did this help?",
				},
			}, nil
		},
	})

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req = withUser(req, testUser)

	h.Get(rec, req)

	if !strings.Contains(rec.Body.String(), `"active_commitment"`) {
		t.Fatalf("body = %s, want active_commitment", rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), `"pending_outcome_prompt"`) {
		t.Fatalf("body = %s, want pending_outcome_prompt", rec.Body.String())
	}
}

func TestInsightHandler_Get_SerializesBriefingRecommendation(t *testing.T) {
	h := handler.NewInsightHandler(&mockInsightService{
		GetFn: func(_ context.Context, _ db.User) (insightsvc.InsightBundle, error) {
			return insightsvc.InsightBundle{
				BriefingRecommendation: &insightsvc.BriefingRecommendation{
					Headline:  "Best move for tomorrow",
					TargetDay: insightsvc.RecommendationTargetTomorrow,
					PrimaryAction: insightsvc.RecommendedActionCandidate{
						Key:       "protect_focus_block",
						Title:     "Protect a 90-minute focus block tomorrow morning",
						Detail:    "Keep the first deep-work block clear.",
						Timeframe: insightsvc.RecommendationTargetTomorrow,
						Kind:      insightsvc.PersonalizationKindTrigger,
						State:     insightsvc.RecommendationStateConfirmed,
					},
					PredictedScoreDelta:  6,
					RiskReductionSummary: "Reduces the chance of a crash day.",
				},
			}, nil
		},
	})

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req = withUser(req, testUser)

	h.Get(rec, req)

	if !strings.Contains(rec.Body.String(), `"briefing_recommendation"`) {
		t.Fatalf("body = %s, want briefing_recommendation field", rec.Body.String())
	}
}

// ── DismissComponent ──────────────────────────────────────────────────────────

func TestInsightHandler_DismissComponent_InvalidJSON(t *testing.T) {
	h := handler.NewInsightHandler(&mockInsightService{})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{bad`))
	req = withUser(req, testUser)
	h.DismissComponent(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("got %d, want 400", rec.Code)
	}
}

func TestInsightHandler_DismissComponent_InvalidComponent(t *testing.T) {
	// Must use the real sentinel so respond.ServiceError routes to 400 via HTTPStatus().
	h := handler.NewInsightHandler(&mockInsightService{
		DismissComponentFn: func(_ context.Context, _ uuid.UUID, _ insightsvc.DismissRequest) error {
			return insightsvc.ErrInvalidComponent
		},
	})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"component_key":""}`))
	req = withUser(req, testUser)
	h.DismissComponent(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("got %d, want 400", rec.Code)
	}
}

func TestInsightHandler_DismissComponent_ServiceError(t *testing.T) {
	h := handler.NewInsightHandler(&mockInsightService{
		DismissComponentFn: func(_ context.Context, _ uuid.UUID, _ insightsvc.DismissRequest) error {
			return errors.New("db error")
		},
	})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"component_key":"momentum"}`))
	req = withUser(req, testUser)
	h.DismissComponent(rec, req)
	if rec.Code != http.StatusInternalServerError {
		t.Errorf("got %d, want 500", rec.Code)
	}
}

func TestInsightHandler_DismissComponent_Success(t *testing.T) {
	h := handler.NewInsightHandler(&mockInsightService{})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"component_key":"momentum"}`))
	req = withUser(req, testUser)
	h.DismissComponent(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("got %d, want 200", rec.Code)
	}
}
