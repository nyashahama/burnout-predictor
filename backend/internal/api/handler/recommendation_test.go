package handler_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/nyasha-hama/burnout-predictor-api/internal/api/handler"
	db "github.com/nyasha-hama/burnout-predictor-api/internal/db/sqlc"
	insightsvc "github.com/nyasha-hama/burnout-predictor-api/internal/service/insight"
)

type mockRecommendationService struct {
	CommitCurrentRecommendationFn func(context.Context, db.User) (*insightsvc.RecommendationCommitment, error)
	CompleteCommitmentFn          func(context.Context, uuid.UUID, uuid.UUID) (*insightsvc.RecommendationCommitment, error)
	SkipCommitmentFn              func(context.Context, uuid.UUID, uuid.UUID) (*insightsvc.RecommendationCommitment, error)
	RecordOutcomeFn               func(context.Context, uuid.UUID, uuid.UUID, insightsvc.OutcomeHelpfulness) (*insightsvc.RecommendationCommitment, error)
}

func (m *mockRecommendationService) CommitCurrentRecommendation(ctx context.Context, user db.User) (*insightsvc.RecommendationCommitment, error) {
	return m.CommitCurrentRecommendationFn(ctx, user)
}
func (m *mockRecommendationService) CompleteCommitment(ctx context.Context, userID uuid.UUID, commitmentID uuid.UUID) (*insightsvc.RecommendationCommitment, error) {
	return m.CompleteCommitmentFn(ctx, userID, commitmentID)
}
func (m *mockRecommendationService) SkipCommitment(ctx context.Context, userID uuid.UUID, commitmentID uuid.UUID) (*insightsvc.RecommendationCommitment, error) {
	return m.SkipCommitmentFn(ctx, userID, commitmentID)
}
func (m *mockRecommendationService) RecordOutcome(ctx context.Context, userID uuid.UUID, commitmentID uuid.UUID, helpfulness insightsvc.OutcomeHelpfulness) (*insightsvc.RecommendationCommitment, error) {
	return m.RecordOutcomeFn(ctx, userID, commitmentID, helpfulness)
}

func TestRecommendationHandler_Commit_Success(t *testing.T) {
	h := handler.NewRecommendationHandlerFromService(&mockRecommendationService{
		CommitCurrentRecommendationFn: func(_ context.Context, _ db.User) (*insightsvc.RecommendationCommitment, error) {
			return &insightsvc.RecommendationCommitment{
				ID:                  uuid.MustParse("33333333-3333-3333-3333-333333333333"),
				RecommendationTitle: "End work by 6 PM tonight",
				Status:              insightsvc.CommitmentStatusCommitted,
				CommittedAt:         time.Date(2026, 4, 16, 9, 0, 0, 0, time.UTC),
			}, nil
		},
	})

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/recommendations/commit", strings.NewReader(`{}`))
	req = withUser(req, testUser)

	h.Commit(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("code = %d, want %d", rec.Code, http.StatusCreated)
	}
	if !strings.Contains(rec.Body.String(), `"status":"committed"`) {
		t.Fatalf("body = %s, want committed response", rec.Body.String())
	}
}
