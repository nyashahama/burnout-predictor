// Package billing handles Paddle webhook event processing and subscription management.
package billing

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	db "github.com/nyasha-hama/burnout-predictor-api/internal/db/sqlc"
	"github.com/nyasha-hama/burnout-predictor-api/internal/reqid"
)

// billingStore is the data-access contract for the billing service.
// store.Postgres satisfies this implicitly.
type billingStore interface {
	CreatePaddleEvent(ctx context.Context, params db.CreatePaddleEventParams) (db.PaddleEvent, error)
	GetUserByID(ctx context.Context, id uuid.UUID) (db.User, error)
	GetUserByPaddleCustomerID(ctx context.Context, paddleCustomerID pgtype.Text) (db.User, error)
	SetPaddleCustomerID(ctx context.Context, params db.SetPaddleCustomerIDParams) error
	UpsertSubscription(ctx context.Context, params db.UpsertSubscriptionParams) (db.Subscription, error)
	CancelSubscription(ctx context.Context, paddleSubID string) error
	SetSubscriptionPastDue(ctx context.Context, paddleSubID string) error
	SetUserTier(ctx context.Context, params db.SetUserTierParams) error
}

// Service handles Paddle webhook processing.
type Service struct {
	store billingStore
	log   *slog.Logger
}

func New(store billingStore, log *slog.Logger) *Service {
	return &Service{store: store, log: log}
}

// ── Paddle payload types ───────────────────────────────────────────────────────

// PaddleEvent is the top-level Paddle webhook envelope.
type PaddleEvent struct {
	EventID   string          `json:"event_id"`
	EventType string          `json:"event_type"`
	Data      json.RawMessage `json:"data"`
}

type paddleSubscriptionData struct {
	ID             string               `json:"id"`
	Status         string               `json:"status"`
	CustomerID     string               `json:"customer_id"`
	CustomData     *paddleCustomData    `json:"custom_data"`
	Items          []paddleItem         `json:"items"`
	CurrentBilling *paddleBillingPeriod `json:"current_billing_period"`
	TrialDates     *paddleTrialDates    `json:"trial_dates"`
	CancelledAt    *time.Time           `json:"cancelled_at"`
}

type paddleTransactionData struct {
	ID             string            `json:"id"`
	CustomerID     string            `json:"customer_id"`
	CustomData     *paddleCustomData `json:"custom_data"`
	SubscriptionID *string           `json:"subscription_id"`
}

type paddleCustomData struct {
	UserID string `json:"user_id"`
}

type paddleItem struct {
	Price    paddlePrice `json:"price"`
	Quantity int         `json:"quantity"`
}

type paddlePrice struct {
	ID          string           `json:"id"`
	Description string           `json:"description"`
	UnitPrice   *paddleUnitPrice `json:"unit_price"`
	Currency    string           `json:"currency_code"`
}

type paddleUnitPrice struct {
	Amount   string `json:"amount"`
	Currency string `json:"currency_code"`
}

type paddleBillingPeriod struct {
	StartsAt time.Time `json:"starts_at"`
	EndsAt   time.Time `json:"ends_at"`
}

type paddleTrialDates struct {
	StartsAt time.Time `json:"starts_at"`
	EndsAt   time.Time `json:"ends_at"`
}

// ── Public methods ─────────────────────────────────────────────────────────────

// ProcessEvent records the Paddle event for idempotency and dispatches to the
// appropriate handler. Returns (true, nil) if the event was already processed.
func (s *Service) ProcessEvent(ctx context.Context, event PaddleEvent, rawBody []byte) (alreadyProcessed bool, err error) {
	subscriptionID := func() pgtype.Text {
		if len(event.Data) > 0 {
			var sub paddleSubscriptionData
			if json.Unmarshal(event.Data, &sub) == nil && sub.ID != "" {
				return pgtype.Text{String: sub.ID, Valid: true}
			}
		}
		return pgtype.Text{}
	}()

	created, err := s.store.CreatePaddleEvent(ctx, db.CreatePaddleEventParams{
		EventID:        event.EventID,
		EventType:      event.EventType,
		SubscriptionID: subscriptionID,
		Payload:        rawBody,
	})
	if err != nil {
		return false, fmt.Errorf("billing: record event: %w", err)
	}
	// ON CONFLICT DO NOTHING returns a zero UUID when the row already exists.
	if created.ID == (uuid.UUID{}) {
		return true, nil
	}

	switch event.EventType {
	case "subscription.created", "subscription.updated":
		var sub paddleSubscriptionData
		if json.Unmarshal(event.Data, &sub) == nil {
			s.handleSubscriptionUpsert(ctx, event.EventType, sub)
		}
	case "subscription.canceled", "subscription.cancelled":
		var sub paddleSubscriptionData
		if json.Unmarshal(event.Data, &sub) == nil {
			s.handleSubscriptionCancelled(ctx, sub)
		}
	case "subscription.paused":
		var sub paddleSubscriptionData
		if json.Unmarshal(event.Data, &sub) == nil {
			s.handleSubscriptionPaused(ctx, sub)
		}
	case "transaction.completed":
		var txn paddleTransactionData
		if json.Unmarshal(event.Data, &txn) == nil {
			s.handleTransactionCompleted(ctx, txn)
		}
	}
	return false, nil
}

// ── Private handlers ───────────────────────────────────────────────────────────

func (s *Service) handleSubscriptionUpsert(ctx context.Context, eventType string, sub paddleSubscriptionData) {
	user, err := s.resolveUserFromPaddleEvent(ctx, sub.CustomerID, sub.CustomData)
	if err != nil {
		s.log.ErrorContext(ctx, "sub upsert: resolve user failed", "request_id", reqid.FromCtx(ctx), "customer_id", sub.CustomerID, "err", err)
		return
	}

	if !user.PaddleCustomerID.Valid && sub.CustomerID != "" {
		if err := s.store.SetPaddleCustomerID(ctx, db.SetPaddleCustomerIDParams{
			ID:               user.ID,
			PaddleCustomerID: pgtype.Text{String: sub.CustomerID, Valid: true},
		}); err != nil {
			s.log.WarnContext(ctx, "sub upsert: set customer id failed", "request_id", reqid.FromCtx(ctx), "user_id", user.ID, "err", err)
		}
	}

	planName, currency, unitPriceCents := extractPlanDetails(sub)

	params := db.UpsertSubscriptionParams{
		UserID:               user.ID,
		PaddleSubscriptionID: sub.ID,
		PaddlePlanID:         planName,
		PlanName:             planName,
		Currency:             currency,
		UnitPriceCents:       pgtype.Int4{Int32: unitPriceCents, Valid: unitPriceCents > 0},
		Status:               sub.Status,
		CancelAtPeriodEnd:    sub.CancelledAt != nil,
		SeatCount:            1,
		LastEventType:        pgtype.Text{String: eventType, Valid: true},
		LastEventAt:          pgtype.Timestamptz{Time: time.Now(), Valid: true},
	}
	if sub.CurrentBilling != nil {
		params.CurrentPeriodStart = pgtype.Timestamptz{Time: sub.CurrentBilling.StartsAt, Valid: true}
		params.CurrentPeriodEnd = pgtype.Timestamptz{Time: sub.CurrentBilling.EndsAt, Valid: true}
	}
	if sub.TrialDates != nil {
		params.TrialEndsAt = pgtype.Timestamptz{Time: sub.TrialDates.EndsAt, Valid: true}
	}

	if _, err := s.store.UpsertSubscription(ctx, params); err != nil {
		s.log.ErrorContext(ctx, "sub upsert: db failed", "request_id", reqid.FromCtx(ctx), "subscription_id", sub.ID, "err", err)
		return
	}

	tier := tierFromStatus(sub.Status, planName)
	if err := s.store.SetUserTier(ctx, db.SetUserTierParams{ID: user.ID, Tier: tier}); err != nil {
		s.log.WarnContext(ctx, "sub upsert: set user tier failed", "request_id", reqid.FromCtx(ctx), "user_id", user.ID, "err", err)
	}
}

func (s *Service) handleSubscriptionCancelled(ctx context.Context, sub paddleSubscriptionData) {
	if err := s.store.CancelSubscription(ctx, sub.ID); err != nil {
		s.log.ErrorContext(ctx, "sub cancel: db failed", "request_id", reqid.FromCtx(ctx), "subscription_id", sub.ID, "err", err)
		return
	}

	shouldDowngradeNow := sub.CurrentBilling == nil || time.Now().After(sub.CurrentBilling.EndsAt)
	if shouldDowngradeNow {
		user, err := s.resolveUserFromPaddleEvent(ctx, sub.CustomerID, sub.CustomData)
		if err == nil {
			if err := s.store.SetUserTier(ctx, db.SetUserTierParams{ID: user.ID, Tier: "free"}); err != nil {
				s.log.WarnContext(ctx, "sub cancel: set user tier failed", "request_id", reqid.FromCtx(ctx), "user_id", user.ID, "err", err)
			}
		}
	}
}

func (s *Service) handleSubscriptionPaused(ctx context.Context, sub paddleSubscriptionData) {
	if err := s.store.SetSubscriptionPastDue(ctx, sub.ID); err != nil {
		s.log.ErrorContext(ctx, "sub pause: set past due failed", "request_id", reqid.FromCtx(ctx), "subscription_id", sub.ID, "err", err)
	}

	user, err := s.resolveUserFromPaddleEvent(ctx, sub.CustomerID, sub.CustomData)
	if err == nil {
		if err := s.store.SetUserTier(ctx, db.SetUserTierParams{ID: user.ID, Tier: "free"}); err != nil {
			s.log.WarnContext(ctx, "sub pause: set user tier failed", "request_id", reqid.FromCtx(ctx), "user_id", user.ID, "err", err)
		}
	}
}

func (s *Service) handleTransactionCompleted(ctx context.Context, txn paddleTransactionData) {
	if txn.CustomerID == "" {
		return
	}

	user, err := s.resolveUserFromPaddleEvent(ctx, txn.CustomerID, txn.CustomData)
	if err != nil {
		s.log.ErrorContext(ctx, "txn: resolve user failed", "request_id", reqid.FromCtx(ctx), "customer_id", txn.CustomerID, "err", err)
		return
	}

	if !user.PaddleCustomerID.Valid {
		if err := s.store.SetPaddleCustomerID(ctx, db.SetPaddleCustomerIDParams{
			ID:               user.ID,
			PaddleCustomerID: pgtype.Text{String: txn.CustomerID, Valid: true},
		}); err != nil {
			s.log.WarnContext(ctx, "txn: set customer id failed", "request_id", reqid.FromCtx(ctx), "user_id", user.ID, "err", err)
		}
	}
}

// ── Private helpers ────────────────────────────────────────────────────────────

func (s *Service) resolveUserFromPaddleEvent(ctx context.Context, customerID string, custom *paddleCustomData) (db.User, error) {
	if custom != nil && custom.UserID != "" {
		uid, err := uuid.Parse(custom.UserID)
		if err == nil {
			return s.store.GetUserByID(ctx, uid)
		}
	}
	if customerID != "" {
		return s.store.GetUserByPaddleCustomerID(ctx, pgtype.Text{String: customerID, Valid: true})
	}
	return db.User{}, fmt.Errorf("billing: no user identifier in event")
}

func tierFromStatus(status, planName string) string {
	switch status {
	case "active", "trialing":
		if strings.Contains(strings.ToLower(planName), "team") {
			return "team"
		}
		return "pro"
	default:
		return "free"
	}
}

func extractPlanDetails(sub paddleSubscriptionData) (planName, currency string, unitPriceCents int32) {
	planName = "Pro"
	currency = "USD"
	if len(sub.Items) == 0 {
		return
	}
	item := sub.Items[0]
	if item.Price.Description != "" {
		planName = item.Price.Description
	}
	if item.Price.Currency != "" {
		currency = item.Price.Currency
	}
	if item.Price.UnitPrice != nil {
		var cents int32
		if n, err := fmt.Sscanf(item.Price.UnitPrice.Amount, "%d", &cents); n == 1 && err == nil {
			unitPriceCents = cents
		}
	}
	return
}
