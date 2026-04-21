package dashboard

import (
	"context"

	"github.com/google/uuid"

	db "github.com/nyasha-hama/burnout-predictor-api/internal/db/sqlc"
	authsvc "github.com/nyasha-hama/burnout-predictor-api/internal/service/auth"
	checkinsvc "github.com/nyasha-hama/burnout-predictor-api/internal/service/checkin"
	insightsvc "github.com/nyasha-hama/burnout-predictor-api/internal/service/insight"
)

type BootstrapResult struct {
	User          authsvc.UserResponse       `json:"user"`
	ScoreCard     checkinsvc.ScoreCardResult `json:"score_card"`
	Checkins      []db.CheckIn               `json:"checkins"`
	InsightBundle insightsvc.InsightBundle   `json:"insight_bundle"`
	FollowUp      *checkinsvc.FollowUpInfo   `json:"follow_up"`
}

type authService interface {
	GetProfile(ctx context.Context, user db.User) authsvc.UserResponse
}

type checkinService interface {
	GetScoreCard(ctx context.Context, user db.User) (checkinsvc.ScoreCardResult, error)
	List(ctx context.Context, userID uuid.UUID, limit, offset int32) ([]db.CheckIn, error)
}

type insightService interface {
	Get(ctx context.Context, user db.User) (insightsvc.InsightBundle, error)
}

type Service struct {
	auth     authService
	checkins checkinService
	insights insightService
}

func New(auth authService, checkins checkinService, insights insightService) *Service {
	return &Service{auth: auth, checkins: checkins, insights: insights}
}

func (s *Service) GetBootstrap(ctx context.Context, user db.User) (BootstrapResult, error) {
	scoreCard, err := s.checkins.GetScoreCard(ctx, user)
	if err != nil {
		return BootstrapResult{}, err
	}
	checkins, err := s.checkins.List(ctx, user.ID, 30, 0)
	if err != nil {
		return BootstrapResult{}, err
	}
	insights, err := s.insights.Get(ctx, user)
	if err != nil {
		return BootstrapResult{}, err
	}

	return BootstrapResult{
		User:          s.auth.GetProfile(ctx, user),
		ScoreCard:     scoreCard,
		Checkins:      checkins,
		InsightBundle: insights,
		FollowUp:      scoreCard.FollowUp,
	}, nil
}
