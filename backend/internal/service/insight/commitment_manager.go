package insight

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/nyasha-hama/burnout-predictor-api/internal/db/sqlc"
)

var errNoActiveCommitment = pgx.ErrNoRows

type commitmentStore interface {
	GetActiveRecommendationCommitment(ctx context.Context, userID uuid.UUID) (db.RecommendationCommitment, error)
	GetRecommendationCommitmentByID(ctx context.Context, params db.GetRecommendationCommitmentByIDParams) (db.RecommendationCommitment, error)
	CreateRecommendationCommitment(ctx context.Context, params db.CreateRecommendationCommitmentParams) (db.RecommendationCommitment, error)
	UpdateRecommendationCommitmentStatus(ctx context.Context, params db.UpdateRecommendationCommitmentStatusParams) (db.RecommendationCommitment, error)
	SetRecommendationCommitmentOutcome(ctx context.Context, params db.SetRecommendationCommitmentOutcomeParams) (db.RecommendationCommitment, error)
	ExpireRecommendationCommitment(ctx context.Context, params db.ExpireRecommendationCommitmentParams) (db.RecommendationCommitment, error)
}

type CommitmentManager struct {
	store commitmentStore
}

func NewCommitmentManager(store commitmentStore) *CommitmentManager {
	return &CommitmentManager{store: store}
}

func (m *CommitmentManager) CommitCurrentRecommendation(ctx context.Context, user db.User, rec *BriefingRecommendation, now time.Time) (*RecommendationCommitment, error) {
	if rec == nil {
		return nil, ErrRecommendationUnavailable
	}

	_, err := m.store.GetActiveRecommendationCommitment(ctx, user.ID)
	if err == nil {
		return nil, ErrActiveCommitmentExists
	}
	if !errors.Is(err, errNoActiveCommitment) {
		return nil, err
	}

	committedAt := now.In(userLocation(user.Timezone))
	dueAt := deriveCommitmentDueAt(committedAt, rec.TargetDay)

	row, err := m.store.CreateRecommendationCommitment(ctx, db.CreateRecommendationCommitmentParams{
		UserID:               user.ID,
		RecommendationKey:    rec.PrimaryAction.Key,
		RecommendationTitle:  rec.PrimaryAction.Title,
		RecommendationDetail: rec.PrimaryAction.Detail,
		WhyThisAction:        rec.WhyThisAction,
		WhyNow:               rec.WhyNow,
		TargetDay:            string(rec.TargetDay),
		BasisKind:            string(rec.Basis.Kind),
		BasisState:           string(rec.Basis.State),
		PredictedScoreDelta:  int32(rec.PredictedScoreDelta),
		Status:               string(CommitmentStatusCommitted),
		CommittedAt:          pgtype.Timestamptz{Time: committedAt, Valid: true},
		DueAt:                pgtype.Timestamptz{Time: dueAt, Valid: true},
	})
	if err != nil {
		return nil, err
	}

	return mapCommitmentRow(row), nil
}

func mapCommitmentRow(row db.RecommendationCommitment) *RecommendationCommitment {
	commitment := &RecommendationCommitment{
		ID:                   row.ID,
		RecommendationKey:    row.RecommendationKey,
		RecommendationTitle:  row.RecommendationTitle,
		RecommendationDetail: row.RecommendationDetail,
		WhyThisAction:        row.WhyThisAction,
		WhyNow:               row.WhyNow,
		TargetDay:            RecommendationTargetDay(row.TargetDay),
		Status:               CommitmentStatus(row.Status),
		PredictedScoreDelta:  int(row.PredictedScoreDelta),
		CommittedAt:          row.CommittedAt.Time,
		DueAt:                row.DueAt.Time,
		Basis: &RecommendationBasis{
			Kind:  PersonalizationKind(row.BasisKind),
			State: RecommendationState(row.BasisState),
		},
	}
	if row.CompletedAt.Valid {
		commitment.CompletedAt = &row.CompletedAt.Time
	}
	if row.OutcomeHelpfulness.Valid {
		helpfulness := OutcomeHelpfulness(row.OutcomeHelpfulness.String)
		commitment.OutcomeHelpfulness = &helpfulness
	}
	if row.EvaluatedAt.Valid {
		commitment.EvaluatedAt = &row.EvaluatedAt.Time
	}
	return commitment
}

func (m *CommitmentManager) CompleteCommitment(ctx context.Context, userID uuid.UUID, commitmentID uuid.UUID) (*RecommendationCommitment, error) {
	completedAt := time.Now().UTC()
	row, err := m.store.UpdateRecommendationCommitmentStatus(ctx, db.UpdateRecommendationCommitmentStatusParams{
		Status:      string(CommitmentStatusCompleted),
		CompletedAt: pgtype.Timestamptz{Time: completedAt, Valid: true},
		ID:          commitmentID,
		UserID:      userID,
	})
	if err != nil {
		return nil, err
	}
	return mapCommitmentRow(row), nil
}

func (m *CommitmentManager) SkipCommitment(ctx context.Context, userID uuid.UUID, commitmentID uuid.UUID) (*RecommendationCommitment, error) {
	row, err := m.store.UpdateRecommendationCommitmentStatus(ctx, db.UpdateRecommendationCommitmentStatusParams{
		Status: string(CommitmentStatusSkipped),
		ID:     commitmentID,
		UserID: userID,
	})
	if err != nil {
		return nil, err
	}
	return mapCommitmentRow(row), nil
}

func (m *CommitmentManager) RecordOutcome(ctx context.Context, userID uuid.UUID, commitmentID uuid.UUID, helpfulness OutcomeHelpfulness) (*RecommendationCommitment, error) {
	row, err := m.store.SetRecommendationCommitmentOutcome(ctx, db.SetRecommendationCommitmentOutcomeParams{
		OutcomeHelpfulness: pgtype.Text{String: string(helpfulness), Valid: true},
		ID:                 commitmentID,
		UserID:             userID,
	})
	if err != nil {
		return nil, err
	}
	return mapCommitmentRow(row), nil
}

func (m *CommitmentManager) GetActiveView(ctx context.Context, userID uuid.UUID, now time.Time) (*RecommendationCommitment, *PendingOutcomePrompt, error) {
	row, err := m.store.GetActiveRecommendationCommitment(ctx, userID)
	if err != nil {
		if errors.Is(err, errNoActiveCommitment) {
			return nil, nil, nil
		}
		return nil, nil, err
	}

	commitment := mapCommitmentRow(row)

	var pendingPrompt *PendingOutcomePrompt
	if commitment.Status == CommitmentStatusCompleted && commitment.CompletedAt != nil {
		if commitment.CompletedAt.Before(now) && commitment.OutcomeHelpfulness == nil {
			pendingPrompt = BuildPendingOutcomePrompt(*commitment)
		}
	}

	return commitment, pendingPrompt, nil
}
