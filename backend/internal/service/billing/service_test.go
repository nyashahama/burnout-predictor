package billing_test

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	db "github.com/nyasha-hama/burnout-predictor-api/internal/db/sqlc"
	"github.com/nyasha-hama/burnout-predictor-api/internal/service/billing"
)

// ── Mock store ────────────────────────────────────────────────────────────────

type mockBillingStore struct {
	createPaddleEvent         func(ctx context.Context, p db.CreatePaddleEventParams) (db.PaddleEvent, error)
	getUserByID               func(ctx context.Context, id uuid.UUID) (db.User, error)
	getUserByPaddleCustomerID func(ctx context.Context, id pgtype.Text) (db.User, error)
	setPaddleCustomerID       func(ctx context.Context, p db.SetPaddleCustomerIDParams) error
	upsertSubscription        func(ctx context.Context, p db.UpsertSubscriptionParams) (db.Subscription, error)
	cancelSubscription        func(ctx context.Context, paddleSubID string) error
	setSubscriptionPastDue    func(ctx context.Context, paddleSubID string) error
	setUserTier               func(ctx context.Context, p db.SetUserTierParams) error
}

func (m *mockBillingStore) CreatePaddleEvent(ctx context.Context, p db.CreatePaddleEventParams) (db.PaddleEvent, error) {
	return m.createPaddleEvent(ctx, p)
}
func (m *mockBillingStore) GetUserByID(ctx context.Context, id uuid.UUID) (db.User, error) {
	if m.getUserByID != nil {
		return m.getUserByID(ctx, id)
	}
	return db.User{}, errors.New("not found")
}
func (m *mockBillingStore) GetUserByPaddleCustomerID(ctx context.Context, id pgtype.Text) (db.User, error) {
	if m.getUserByPaddleCustomerID != nil {
		return m.getUserByPaddleCustomerID(ctx, id)
	}
	return db.User{}, errors.New("not found")
}
func (m *mockBillingStore) SetPaddleCustomerID(ctx context.Context, p db.SetPaddleCustomerIDParams) error {
	if m.setPaddleCustomerID != nil {
		return m.setPaddleCustomerID(ctx, p)
	}
	return nil
}
func (m *mockBillingStore) UpsertSubscription(ctx context.Context, p db.UpsertSubscriptionParams) (db.Subscription, error) {
	if m.upsertSubscription != nil {
		return m.upsertSubscription(ctx, p)
	}
	return db.Subscription{}, nil
}
func (m *mockBillingStore) CancelSubscription(ctx context.Context, id string) error {
	if m.cancelSubscription != nil {
		return m.cancelSubscription(ctx, id)
	}
	return nil
}
func (m *mockBillingStore) SetSubscriptionPastDue(ctx context.Context, id string) error {
	if m.setSubscriptionPastDue != nil {
		return m.setSubscriptionPastDue(ctx, id)
	}
	return nil
}
func (m *mockBillingStore) SetUserTier(ctx context.Context, p db.SetUserTierParams) error {
	if m.setUserTier != nil {
		return m.setUserTier(ctx, p)
	}
	return nil
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func newBillingService(store *mockBillingStore) *billing.Service {
	// nil pool is intentional — the withTx path is not exercised in unit tests.
	// withTx has a nil guard that returns an error rather than panicking.
	return billing.New(store, nil, slog.Default())
}

// eventJSON builds a minimal Paddle event payload with the given event type and data.
func eventJSON(t *testing.T, eventType string, data any) (billing.PaddleEvent, []byte) {
	t.Helper()
	raw, err := json.Marshal(data)
	if err != nil {
		t.Fatalf("eventJSON: marshal data: %v", err)
	}
	ev := billing.PaddleEvent{
		EventID:   uuid.New().String(),
		EventType: eventType,
		Data:      raw,
	}
	body, err := json.Marshal(ev)
	if err != nil {
		t.Fatalf("eventJSON: marshal event: %v", err)
	}
	return ev, body
}

// ── Tests ─────────────────────────────────────────────────────────────────────

func TestProcessEvent_AlreadyProcessed(t *testing.T) {
	// ON CONFLICT DO NOTHING returns a zero-UUID row — signals idempotent duplicate.
	store := &mockBillingStore{
		createPaddleEvent: func(_ context.Context, _ db.CreatePaddleEventParams) (db.PaddleEvent, error) {
			return db.PaddleEvent{ID: uuid.UUID{}}, nil // zero UUID = already exists
		},
	}
	svc := newBillingService(store)

	ev, body := eventJSON(t, "subscription.created", map[string]string{})
	already, err := svc.ProcessEvent(context.Background(), ev, body)

	if err != nil {
		t.Fatalf("ProcessEvent() error = %v, want nil", err)
	}
	if !already {
		t.Error("alreadyProcessed = false, want true for duplicate event")
	}
}

func TestProcessEvent_NewEvent(t *testing.T) {
	newID := uuid.New()
	store := &mockBillingStore{
		createPaddleEvent: func(_ context.Context, _ db.CreatePaddleEventParams) (db.PaddleEvent, error) {
			return db.PaddleEvent{ID: newID}, nil // non-zero UUID = new event
		},
	}
	svc := newBillingService(store)

	ev, body := eventJSON(t, "unknown.event.type", map[string]string{})
	already, err := svc.ProcessEvent(context.Background(), ev, body)

	if err != nil {
		t.Fatalf("ProcessEvent() error = %v, want nil", err)
	}
	if already {
		t.Error("alreadyProcessed = true, want false for new event")
	}
}

func TestProcessEvent_StoreError(t *testing.T) {
	store := &mockBillingStore{
		createPaddleEvent: func(_ context.Context, _ db.CreatePaddleEventParams) (db.PaddleEvent, error) {
			return db.PaddleEvent{}, errors.New("db error")
		},
	}
	svc := newBillingService(store)

	ev, body := eventJSON(t, "subscription.created", map[string]string{})
	_, err := svc.ProcessEvent(context.Background(), ev, body)

	if err == nil {
		t.Error("ProcessEvent() error = nil, want db error")
	}
}
