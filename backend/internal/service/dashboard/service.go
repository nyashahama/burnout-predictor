package dashboard

import (
	"context"

	"github.com/nyasha-hama/burnout-predictor-api/internal/api/handler"
	db "github.com/nyasha-hama/burnout-predictor-api/internal/db/sqlc"
	authsvc "github.com/nyasha-hama/burnout-predictor-api/internal/service/auth"
	checkinsvc "github.com/nyasha-hama/burnout-predictor-api/internal/service/checkin"
	insightsvc "github.com/nyasha-hama/burnout-predictor-api/internal/service/insight"
)

type Service struct {
	auth     *authsvc.Service
	checkins *checkinsvc.Service
	insights *insightsvc.Service
}

func New(auth *authsvc.Service, checkins *checkinsvc.Service, insights *insightsvc.Service) *Service {
	return &Service{auth: auth, checkins: checkins, insights: insights}
}

func (s *Service) GetBootstrap(ctx context.Context, user db.User) (handler.BootstrapResult, error) {
	scoreCard, err := s.checkins.GetScoreCard(ctx, user)
	if err != nil {
		return handler.BootstrapResult{}, err
	}
	checkins, err := s.checkins.List(ctx, user.ID, 30, 0)
	if err != nil {
		return handler.BootstrapResult{}, err
	}
	insights, err := s.insights.Get(ctx, user)
	if err != nil {
		return handler.BootstrapResult{}, err
	}
	return handler.BootstrapResult{
		User:          s.auth.GetProfile(ctx, user),
		ScoreCard:     scoreCard,
		Checkins:      checkins,
		InsightBundle: insights,
		FollowUp:      scoreCard.FollowUp,
	}, nil
}