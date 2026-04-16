package insight

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	db "github.com/nyasha-hama/burnout-predictor-api/internal/db/sqlc"
)

type stubCommitmentStore struct {
	getActiveFn    func(context.Context, uuid.UUID) (db.RecommendationCommitment, error)
	createFn       func(context.Context, db.CreateRecommendationCommitmentParams) (db.RecommendationCommitment, error)
	getByIDFn      func(context.Context, db.GetRecommendationCommitmentByIDParams) (db.RecommendationCommitment, error)
	updateStatusFn func(context.Context, db.UpdateRecommendationCommitmentStatusParams) (db.RecommendationCommitment, error)
	setOutcomeFn   func(context.Context, db.SetRecommendationCommitmentOutcomeParams) (db.RecommendationCommitment, error)
	expireFn       func(context.Context, db.ExpireRecommendationCommitmentParams) (db.RecommendationCommitment, error)
}

func (s *stubCommitmentStore) GetActiveRecommendationCommitment(ctx context.Context, userID uuid.UUID) (db.RecommendationCommitment, error) {
	return s.getActiveFn(ctx, userID)
}

func (s *stubCommitmentStore) CreateRecommendationCommitment(ctx context.Context, params db.CreateRecommendationCommitmentParams) (db.RecommendationCommitment, error) {
	return s.createFn(ctx, params)
}

func (s *stubCommitmentStore) GetRecommendationCommitmentByID(ctx context.Context, params db.GetRecommendationCommitmentByIDParams) (db.RecommendationCommitment, error) {
	if s.getByIDFn != nil {
		return s.getByIDFn(ctx, params)
	}
	return db.RecommendationCommitment{}, pgx.ErrNoRows
}

func (s *stubCommitmentStore) UpdateRecommendationCommitmentStatus(ctx context.Context, params db.UpdateRecommendationCommitmentStatusParams) (db.RecommendationCommitment, error) {
	if s.updateStatusFn != nil {
		return s.updateStatusFn(ctx, params)
	}
	return db.RecommendationCommitment{}, nil
}

func (s *stubCommitmentStore) SetRecommendationCommitmentOutcome(ctx context.Context, params db.SetRecommendationCommitmentOutcomeParams) (db.RecommendationCommitment, error) {
	if s.setOutcomeFn != nil {
		return s.setOutcomeFn(ctx, params)
	}
	return db.RecommendationCommitment{}, nil
}

func (s *stubCommitmentStore) ExpireRecommendationCommitment(ctx context.Context, params db.ExpireRecommendationCommitmentParams) (db.RecommendationCommitment, error) {
	if s.expireFn != nil {
		return s.expireFn(ctx, params)
	}
	return db.RecommendationCommitment{}, nil
}

func TestCommitmentManager_CommitCurrentRecommendationRejectsSecondActiveCommitment(t *testing.T) {
	userID := uuid.MustParse("11111111-1111-1111-1111-111111111111")
	mgr := NewCommitmentManager(&stubCommitmentStore{
		getActiveFn: func(context.Context, uuid.UUID) (db.RecommendationCommitment, error) {
			return db.RecommendationCommitment{UserID: userID}, nil
		},
		createFn: func(context.Context, db.CreateRecommendationCommitmentParams) (db.RecommendationCommitment, error) {
			t.Fatalf("create should not be called when an active commitment exists")
			return db.RecommendationCommitment{}, nil
		},
	})

	user := db.User{ID: userID, Timezone: "UTC"}
	_, err := mgr.CommitCurrentRecommendation(context.Background(), user, &BriefingRecommendation{
		PrimaryAction: RecommendedActionCandidate{
			Key:       "shutdown_on_time",
			Title:     "End work by 6 PM tonight",
			Detail:    "Use an earlier shutdown to reduce tomorrow's load.",
			Timeframe: RecommendationTargetToday,
		},
		WhyThisAction:       "Late work is pushing your strain up.",
		WhyNow:              "There is still time for this to matter.",
		PredictedScoreDelta: 4,
		Basis: &RecommendationBasis{
			Kind:  PersonalizationKindRecovery,
			State: RecommendationStateEmerging,
		},
	}, time.Date(2026, 4, 16, 12, 0, 0, 0, time.UTC))

	if !errors.Is(err, ErrActiveCommitmentExists) {
		t.Fatalf("err = %v, want ErrActiveCommitmentExists", err)
	}
}

func TestCommitmentManager_CommitCurrentRecommendationSnapshotsRecommendationFields(t *testing.T) {
	userID := uuid.MustParse("11111111-1111-1111-1111-111111111111")
	var got db.CreateRecommendationCommitmentParams

	mgr := NewCommitmentManager(&stubCommitmentStore{
		getActiveFn: func(context.Context, uuid.UUID) (db.RecommendationCommitment, error) {
			return db.RecommendationCommitment{}, pgx.ErrNoRows
		},
		createFn: func(_ context.Context, params db.CreateRecommendationCommitmentParams) (db.RecommendationCommitment, error) {
			got = params
			return db.RecommendationCommitment{
				ID:                  uuid.MustParse("22222222-2222-2222-2222-222222222222"),
				UserID:              params.UserID,
				RecommendationKey:   params.RecommendationKey,
				RecommendationTitle: params.RecommendationTitle,
				Status:              params.Status,
				CommittedAt:         params.CommittedAt,
				DueAt:               params.DueAt,
			}, nil
		},
	})

	user := db.User{ID: userID, Timezone: "UTC"}
	recommendation := &BriefingRecommendation{
		TargetDay: RecommendationTargetTomorrow,
		PrimaryAction: RecommendedActionCandidate{
			Key:       "protect_focus_block",
			Title:     "Protect a 90-minute focus block tomorrow morning",
			Detail:    "Keep the first deep-work block clear.",
			Timeframe: RecommendationTargetTomorrow,
			Kind:      PersonalizationKindTrigger,
			State:     RecommendationStateConfirmed,
		},
		WhyThisAction:       "Meetings are your strongest confirmed trigger.",
		WhyNow:              "This is easiest to set up before tomorrow starts.",
		PredictedScoreDelta: 6,
		Basis: &RecommendationBasis{
			Kind:  PersonalizationKindTrigger,
			State: RecommendationStateConfirmed,
		},
	}
	_, err := mgr.CommitCurrentRecommendation(context.Background(), user, recommendation, time.Date(2026, 4, 16, 10, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatalf("CommitCurrentRecommendation() error = %v", err)
	}

	if got.RecommendationKey != "protect_focus_block" {
		t.Fatalf("key = %q, want %q", got.RecommendationKey, "protect_focus_block")
	}
	if got.Status != string(CommitmentStatusCommitted) {
		t.Fatalf("status = %q, want %q", got.Status, CommitmentStatusCommitted)
	}
	wantDueAt := time.Date(2026, 4, 17, 23, 59, 59, 0, time.UTC)
	if !got.DueAt.Time.Equal(wantDueAt) {
		t.Fatalf("due_at = %v, want %v", got.DueAt.Time, wantDueAt)
	}
}
