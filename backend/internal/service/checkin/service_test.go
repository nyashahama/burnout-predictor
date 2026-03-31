package checkin_test

import (
	"context"
	"errors"
	"log/slog"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	db "github.com/nyasha-hama/burnout-predictor-api/internal/db/sqlc"
	"github.com/nyasha-hama/burnout-predictor-api/internal/service/checkin"
)

// ── Mock store ────────────────────────────────────────────────────────────────

type mockCheckinStore struct {
	upsertCheckIn            func(ctx context.Context, p db.UpsertCheckInParams) (db.CheckIn, error)
	getTodayCheckIn          func(ctx context.Context, p db.GetTodayCheckInParams) (db.CheckIn, error)
	listCheckIns             func(ctx context.Context, p db.ListCheckInsParams) ([]db.CheckIn, error)
	listRecentCheckIns       func(ctx context.Context, p db.ListRecentCheckInsParams) ([]db.ListRecentCheckInsRow, error)
	getConsecutiveDangerDays func(ctx context.Context, userID uuid.UUID) (int32, error)
	getCheckInStreak         func(ctx context.Context, userID uuid.UUID) (int32, error)
	countCheckIns            func(ctx context.Context, userID uuid.UUID) (int64, error)
	setAIRecoveryPlan        func(ctx context.Context, p db.SetAIRecoveryPlanParams) error
	createFollowUp           func(ctx context.Context, p db.CreateFollowUpParams) (db.FollowUp, error)
}

func (m *mockCheckinStore) UpsertCheckIn(ctx context.Context, p db.UpsertCheckInParams) (db.CheckIn, error) {
	return m.upsertCheckIn(ctx, p)
}
func (m *mockCheckinStore) GetTodayCheckIn(ctx context.Context, p db.GetTodayCheckInParams) (db.CheckIn, error) {
	if m.getTodayCheckIn != nil {
		return m.getTodayCheckIn(ctx, p)
	}
	return db.CheckIn{}, errors.New("no check-in")
}
func (m *mockCheckinStore) ListCheckIns(ctx context.Context, p db.ListCheckInsParams) ([]db.CheckIn, error) {
	if m.listCheckIns != nil {
		return m.listCheckIns(ctx, p)
	}
	return nil, nil
}
func (m *mockCheckinStore) ListRecentCheckIns(ctx context.Context, p db.ListRecentCheckInsParams) ([]db.ListRecentCheckInsRow, error) {
	if m.listRecentCheckIns != nil {
		return m.listRecentCheckIns(ctx, p)
	}
	return nil, nil
}
func (m *mockCheckinStore) GetConsecutiveDangerDays(ctx context.Context, id uuid.UUID) (int32, error) {
	if m.getConsecutiveDangerDays != nil {
		return m.getConsecutiveDangerDays(ctx, id)
	}
	return 0, nil
}
func (m *mockCheckinStore) GetCheckInStreak(ctx context.Context, id uuid.UUID) (int32, error) {
	if m.getCheckInStreak != nil {
		return m.getCheckInStreak(ctx, id)
	}
	return 0, nil
}
func (m *mockCheckinStore) CountCheckIns(ctx context.Context, id uuid.UUID) (int64, error) {
	if m.countCheckIns != nil {
		return m.countCheckIns(ctx, id)
	}
	return 0, nil
}
func (m *mockCheckinStore) SetAIRecoveryPlan(ctx context.Context, p db.SetAIRecoveryPlanParams) error {
	if m.setAIRecoveryPlan != nil {
		return m.setAIRecoveryPlan(ctx, p)
	}
	return nil
}
func (m *mockCheckinStore) CreateFollowUp(ctx context.Context, p db.CreateFollowUpParams) (db.FollowUp, error) {
	if m.createFollowUp != nil {
		return m.createFollowUp(ctx, p)
	}
	return db.FollowUp{}, nil
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func newCheckinService(store *mockCheckinStore) *checkin.Service {
	return checkin.New(store, nil, slog.Default()) // no AI client
}

func defaultUser() db.User {
	return db.User{
		ID:            uuid.New(),
		Email:         "alice@example.com",
		Name:          "Alice",
		Role:          "engineer",
		SleepBaseline: 8,
		Timezone:      "UTC",
	}
}

func okCheckin(userID uuid.UUID, stress int) func(context.Context, db.UpsertCheckInParams) (db.CheckIn, error) {
	return func(_ context.Context, p db.UpsertCheckInParams) (db.CheckIn, error) {
		return db.CheckIn{
			ID:            uuid.New(),
			UserID:        userID,
			Stress:        int16(stress),
			CheckedInDate: pgtype.Date{Time: time.Now().UTC(), Valid: true},
		}, nil
	}
}

// ── Tests ─────────────────────────────────────────────────────────────────────

func TestUpsert_InvalidStress(t *testing.T) {
	svc := newCheckinService(&mockCheckinStore{})
	user := defaultUser()

	for _, bad := range []int{0, 6, -1, 100} {
		_, err := svc.Upsert(context.Background(), user, checkin.UpsertRequest{Stress: bad})
		if !errors.Is(err, checkin.ErrInvalidStress) {
			t.Errorf("Upsert(stress=%d) error = %v, want ErrInvalidStress", bad, err)
		}
	}
}

func TestUpsert_ValidStressRange(t *testing.T) {
	user := defaultUser()
	for _, stress := range []int{1, 2, 3, 4, 5} {
		store := &mockCheckinStore{
			upsertCheckIn: okCheckin(user.ID, stress),
		}
		svc := newCheckinService(store)

		res, err := svc.Upsert(context.Background(), user, checkin.UpsertRequest{Stress: stress})
		if err != nil {
			t.Errorf("Upsert(stress=%d) error = %v, want nil", stress, err)
		}
		if res.Score.Score == 0 {
			t.Errorf("Upsert(stress=%d) Score = 0, want non-zero", stress)
		}
	}
}

func TestUpsert_ScoreIncludesStress(t *testing.T) {
	// A stress=5 check-in (max) should always produce a higher score than stress=1.
	user := defaultUser()

	upsertWith := func(stress int) int {
		store := &mockCheckinStore{
			upsertCheckIn: okCheckin(user.ID, stress),
		}
		res, _ := checkin.New(store, nil, slog.Default()).Upsert(context.Background(), user, checkin.UpsertRequest{Stress: stress})
		return res.Score.Score
	}

	highScore := upsertWith(5)
	lowScore := upsertWith(1)

	if highScore <= lowScore {
		t.Errorf("score(stress=5)=%d should be greater than score(stress=1)=%d", highScore, lowScore)
	}
}

func TestUpsert_StoreError(t *testing.T) {
	store := &mockCheckinStore{
		upsertCheckIn: func(_ context.Context, _ db.UpsertCheckInParams) (db.CheckIn, error) {
			return db.CheckIn{}, errors.New("db down")
		},
	}
	svc := newCheckinService(store)

	_, err := svc.Upsert(context.Background(), defaultUser(), checkin.UpsertRequest{Stress: 3})
	if err == nil {
		t.Error("Upsert() error = nil, want db error")
	}
}

func TestGetScoreCard_NoCheckIn(t *testing.T) {
	store := &mockCheckinStore{} // getTodayCheckIn returns error by default
	svc := newCheckinService(store)

	res, err := svc.GetScoreCard(context.Background(), defaultUser())
	if err != nil {
		t.Fatalf("GetScoreCard() error = %v, want nil", err)
	}
	if res.HasCheckIn {
		t.Error("HasCheckIn = true, want false when no check-in today")
	}
}

func TestGetScoreCard_WithCheckIn(t *testing.T) {
	user := defaultUser()
	store := &mockCheckinStore{
		getTodayCheckIn: func(_ context.Context, _ db.GetTodayCheckInParams) (db.CheckIn, error) {
			return db.CheckIn{
				Stress:        3,
				Score:         50,
				CheckedInDate: pgtype.Date{Time: time.Now().UTC(), Valid: true},
			}, nil
		},
	}
	svc := newCheckinService(store)

	res, err := svc.GetScoreCard(context.Background(), user)
	if err != nil {
		t.Fatalf("GetScoreCard() error = %v, want nil", err)
	}
	if !res.HasCheckIn {
		t.Error("HasCheckIn = false, want true when check-in exists")
	}
	if res.DailyForecast.Summary == "" {
		t.Error("DailyForecast summary = empty, want populated")
	}
	if res.RecommendedAction.Title == "" {
		t.Error("RecommendedAction title = empty, want populated")
	}
}
