package api

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	db "github.com/nyasha-hama/burnout-predictor-api/internal/db/sqlc"
)

// PaddleWebhook handles POST /api/webhooks/paddle.
//
// Validates the Paddle-Signature header (HMAC-SHA256), stores the raw event for
// idempotency, then dispatches to the appropriate handler for each event type.
// Always returns 200 to prevent Paddle from retrying events we've already logged.
func (h *Handler) PaddleWebhook(w http.ResponseWriter, r *http.Request) {
	// Read the raw body — needed both for HMAC verification and JSON parsing.
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20)) // 1 MB max
	if err != nil {
		writeError(w, http.StatusBadRequest, "could not read body")
		return
	}

	// Validate signature when a secret is configured.
	if len(h.paddleSecret) > 0 {
		if !h.verifyPaddleSignature(r.Header.Get("Paddle-Signature"), body) {
			writeError(w, http.StatusUnauthorized, "invalid signature")
			return
		}
	}

	var event paddleEvent
	if err := json.Unmarshal(body, &event); err != nil || event.EventID == "" {
		writeError(w, http.StatusBadRequest, "invalid event payload")
		return
	}

	// Idempotency: log the event first. ON CONFLICT DO NOTHING means duplicate
	// deliveries return a zero-value row — we check EventID to detect that.
	loggedEvent, err := h.q.CreatePaddleEvent(r.Context(), db.CreatePaddleEventParams{
		EventID:   event.EventID,
		EventType: event.EventType,
		SubscriptionID: func() pgtype.Text {
			if event.Data != nil {
				var sub paddleSubscriptionData
				if json.Unmarshal(event.Data, &sub) == nil && sub.ID != "" {
					return pgtype.Text{String: sub.ID, Valid: true}
				}
			}
			return pgtype.Text{}
		}(),
		Payload: body,
	})
	if err != nil {
		// DB error — return 500 so Paddle retries.
		log.Printf("webhook/paddle: store event %s: %v", event.EventID, err)
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}
	// ON CONFLICT DO NOTHING returns a zero UUID — already processed.
	if loggedEvent.ID == [16]byte{} {
		writeJSON(w, http.StatusOK, map[string]string{"status": "already processed"})
		return
	}

	// Dispatch.
	switch event.EventType {
	case "subscription.created", "subscription.updated":
		h.handleSubscriptionUpsert(r, event)
	case "subscription.canceled", "subscription.cancelled":
		h.handleSubscriptionCancelled(r, event)
	case "subscription.paused":
		h.handleSubscriptionPaused(r, event)
	case "transaction.completed":
		h.handleTransactionCompleted(r, event)
	default:
		// Unknown event type — logged, nothing to do.
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// verifyPaddleSignature validates the Paddle-Signature header.
// Header format: ts=<unix>;<whitespace>h1=<hex-hmac>
// Signed payload: "<ts>:<raw body>"
func (h *Handler) verifyPaddleSignature(header string, body []byte) bool {
	if header == "" {
		return false
	}

	var ts, sig string
	for _, part := range strings.Split(header, ";") {
		part = strings.TrimSpace(part)
		if strings.HasPrefix(part, "ts=") {
			ts = strings.TrimPrefix(part, "ts=")
		} else if strings.HasPrefix(part, "h1=") {
			sig = strings.TrimPrefix(part, "h1=")
		}
	}
	if ts == "" || sig == "" {
		return false
	}

	signed := ts + ":" + string(body)
	mac := hmac.New(sha256.New, h.paddleSecret)
	mac.Write([]byte(signed))
	expected := fmt.Sprintf("%x", mac.Sum(nil))
	return hmac.Equal([]byte(expected), []byte(sig))
}

// ── event handlers ────────────────────────────────────────────────────────────

func (h *Handler) handleSubscriptionUpsert(r *http.Request, event paddleEvent) {
	var sub paddleSubscriptionData
	if err := json.Unmarshal(event.Data, &sub); err != nil {
		log.Printf("webhook/paddle: parse subscription data: %v", err)
		return
	}

	user, err := h.resolveUserFromPaddleEvent(r, sub.CustomerID, sub.CustomData)
	if err != nil {
		log.Printf("webhook/paddle: resolve user for customer %s: %v", sub.CustomerID, err)
		return
	}

	// Store the Paddle customer ID on the user if not already set.
	if !user.PaddleCustomerID.Valid && sub.CustomerID != "" {
		_ = h.q.SetPaddleCustomerID(r.Context(), db.SetPaddleCustomerIDParams{
			ID:               user.ID,
			PaddleCustomerID: pgtype.Text{String: sub.CustomerID, Valid: true},
		})
	}

	planName, currency, unitPrice := extractPlanDetails(sub)

	params := db.UpsertSubscriptionParams{
		UserID:               user.ID,
		PaddleSubscriptionID: sub.ID,
		PaddlePlanID:         planName, // use plan name as plan ID for simplicity
		PlanName:             planName,
		Currency:             currency,
		UnitPriceCents:       pgtype.Int4{Int32: unitPrice, Valid: unitPrice > 0},
		Status:               sub.Status,
		CancelAtPeriodEnd:    sub.CancelledAt != nil,
		SeatCount:            1,
		LastEventType:        pgtype.Text{String: event.EventType, Valid: true},
		LastEventAt:          pgtype.Timestamptz{Time: time.Now(), Valid: true},
	}

	if sub.CurrentBilling != nil {
		params.CurrentPeriodStart = pgtype.Timestamptz{Time: sub.CurrentBilling.StartsAt, Valid: true}
		params.CurrentPeriodEnd = pgtype.Timestamptz{Time: sub.CurrentBilling.EndsAt, Valid: true}
	}
	if sub.TrialDates != nil {
		params.TrialEndsAt = pgtype.Timestamptz{Time: sub.TrialDates.EndsAt, Valid: true}
	}

	if _, err := h.q.UpsertSubscription(r.Context(), params); err != nil {
		log.Printf("webhook/paddle: upsert subscription %s: %v", sub.ID, err)
		return
	}

	// Update user tier based on active subscription.
	tier := tierFromStatus(sub.Status, planName)
	_ = h.q.SetUserTier(r.Context(), db.SetUserTierParams{ID: user.ID, Tier: tier})
}

func (h *Handler) handleSubscriptionCancelled(r *http.Request, event paddleEvent) {
	var sub paddleSubscriptionData
	if err := json.Unmarshal(event.Data, &sub); err != nil {
		return
	}

	if err := h.q.CancelSubscription(r.Context(), sub.ID); err != nil {
		log.Printf("webhook/paddle: cancel subscription %s: %v", sub.ID, err)
		return
	}

	// Downgrade to free if the period has ended (or no period info).
	shouldDowngradeNow := sub.CurrentBilling == nil || time.Now().After(sub.CurrentBilling.EndsAt)
	if shouldDowngradeNow {
		user, err := h.resolveUserFromPaddleEvent(r, sub.CustomerID, sub.CustomData)
		if err == nil {
			_ = h.q.SetUserTier(r.Context(), db.SetUserTierParams{ID: user.ID, Tier: "free"})
		}
	}
}

func (h *Handler) handleSubscriptionPaused(r *http.Request, event paddleEvent) {
	var sub paddleSubscriptionData
	if err := json.Unmarshal(event.Data, &sub); err != nil {
		return
	}

	// Mark past_due to differentiate from cancelled; tier drops to free.
	if err := h.q.SetSubscriptionPastDue(r.Context(), sub.ID); err != nil {
		log.Printf("webhook/paddle: pause subscription %s: %v", sub.ID, err)
	}

	user, err := h.resolveUserFromPaddleEvent(r, sub.CustomerID, sub.CustomData)
	if err == nil {
		_ = h.q.SetUserTier(r.Context(), db.SetUserTierParams{ID: user.ID, Tier: "free"})
	}
}

func (h *Handler) handleTransactionCompleted(r *http.Request, event paddleEvent) {
	var txn paddleTransactionData
	if err := json.Unmarshal(event.Data, &txn); err != nil {
		return
	}
	if txn.CustomerID == "" {
		return
	}

	user, err := h.resolveUserFromPaddleEvent(r, txn.CustomerID, txn.CustomData)
	if err != nil {
		return
	}

	if !user.PaddleCustomerID.Valid {
		_ = h.q.SetPaddleCustomerID(r.Context(), db.SetPaddleCustomerIDParams{
			ID:               user.ID,
			PaddleCustomerID: pgtype.Text{String: txn.CustomerID, Valid: true},
		})
	}
}

// ── helpers ───────────────────────────────────────────────────────────────────

// resolveUserFromPaddleEvent finds the user by custom_data.user_id first,
// then falls back to paddle_customer_id lookup.
func (h *Handler) resolveUserFromPaddleEvent(r *http.Request, customerID string, customData *paddleCustomData) (db.User, error) {
	if customData != nil && customData.UserID != "" {
		if id, err := parseUUID(customData.UserID); err == nil {
			return h.q.GetUserByID(r.Context(), id)
		}
	}
	if customerID != "" {
		return h.q.GetUserByPaddleCustomerID(r.Context(), pgtype.Text{String: customerID, Valid: true})
	}
	return db.User{}, fmt.Errorf("no user identifier in event")
}

// tierFromStatus maps Paddle subscription status + plan name to our internal tier.
func tierFromStatus(status, planName string) string {
	switch status {
	case "active", "trialing":
		lower := strings.ToLower(planName)
		if strings.Contains(lower, "team") {
			return "team"
		}
		return "pro"
	default:
		return "free"
	}
}

// extractPlanDetails pulls plan name, currency, and unit price (in cents) from
// the first item in a Paddle subscription.
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
		// Paddle returns amount as a string in the smallest currency unit (e.g. "1000" = $10.00).
		var cents int32
		fmt.Sscanf(item.Price.UnitPrice.Amount, "%d", &cents)
		unitPriceCents = cents
	}
	return
}

// parseUUID wraps uuid.Parse for use in this file without importing uuid directly.
func parseUUID(s string) ([16]byte, error) {
	if len(s) != 36 {
		return [16]byte{}, fmt.Errorf("invalid uuid length")
	}
	// Use the db package's uuid import indirectly via a zero-value check.
	// Actually parse it properly using the standard format.
	var b [16]byte
	s2 := strings.ReplaceAll(s, "-", "")
	if len(s2) != 32 {
		return b, fmt.Errorf("invalid uuid")
	}
	for i := 0; i < 16; i++ {
		var val byte
		fmt.Sscanf(s2[i*2:i*2+2], "%02x", &val)
		b[i] = val
	}
	return b, nil
}

// ── Paddle v2 event payload types ────────────────────────────────────────────

type paddleEvent struct {
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
	PausedAt       *time.Time           `json:"paused_at"`
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
