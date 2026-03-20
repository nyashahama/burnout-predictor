package handler_test

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/nyasha-hama/burnout-predictor-api/internal/api/handler"
	billingsvc "github.com/nyasha-hama/burnout-predictor-api/internal/service/billing"
)

// ── mock ──────────────────────────────────────────────────────────────────────

type mockBillingService struct {
	ProcessEventFn func(context.Context, billingsvc.PaddleEvent, []byte) (bool, error)
}

func (m *mockBillingService) ProcessEvent(ctx context.Context, event billingsvc.PaddleEvent, rawBody []byte) (bool, error) {
	if m.ProcessEventFn != nil {
		return m.ProcessEventFn(ctx, event, rawBody)
	}
	return false, nil
}

// paddleSignatureHeader returns a valid Paddle-Signature header value.
// HMAC message: ts + ":" + string(body).
func paddleSignatureHeader(secret []byte, body []byte, ts string) string {
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(ts + ":" + string(body)))
	sig := fmt.Sprintf("%x", mac.Sum(nil))
	return "ts=" + ts + ";h1=" + sig
}

// ── valid event body ──────────────────────────────────────────────────────────

const validEventBody = `{"event_id":"evt_001","event_type":"subscription.created","data":{}}`

// ── Tests ─────────────────────────────────────────────────────────────────────

func TestWebhookHandler_Paddle_NoSecret_SkipsSignatureCheck(t *testing.T) {
	// nil paddleSecret → signature check skipped entirely → 200.
	h := handler.NewWebhookHandler(&mockBillingService{}, nil)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(validEventBody))
	h.Paddle(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("got %d, want 200", rec.Code)
	}
}

func TestWebhookHandler_Paddle_ValidSignature(t *testing.T) {
	secret := []byte("webhook-secret")
	ts := fmt.Sprintf("%d", time.Now().Unix())
	body := []byte(validEventBody)
	h := handler.NewWebhookHandler(&mockBillingService{}, secret)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(string(body)))
	req.Header.Set("Paddle-Signature", paddleSignatureHeader(secret, body, ts))
	h.Paddle(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("got %d, want 200", rec.Code)
	}
}

func TestWebhookHandler_Paddle_InvalidSignature(t *testing.T) {
	secret := []byte("webhook-secret")
	h := handler.NewWebhookHandler(&mockBillingService{}, secret)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(validEventBody))
	req.Header.Set("Paddle-Signature", "ts=1700000000;h1=badhash")
	h.Paddle(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("got %d, want 401", rec.Code)
	}
}

func TestWebhookHandler_Paddle_MalformedJSON(t *testing.T) {
	h := handler.NewWebhookHandler(&mockBillingService{}, nil)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{bad`))
	h.Paddle(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("got %d, want 400", rec.Code)
	}
}

func TestWebhookHandler_Paddle_ValidJSONEmptyEventID(t *testing.T) {
	// Handler checks event.EventID == "" after unmarshal → 400.
	h := handler.NewWebhookHandler(&mockBillingService{}, nil)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"event_id":"","event_type":"foo","data":{}}`))
	h.Paddle(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("got %d, want 400", rec.Code)
	}
}

func TestWebhookHandler_Paddle_AlreadyProcessed(t *testing.T) {
	h := handler.NewWebhookHandler(&mockBillingService{
		ProcessEventFn: func(_ context.Context, _ billingsvc.PaddleEvent, _ []byte) (bool, error) {
			return true, nil // alreadyProcessed = true
		},
	}, nil)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(validEventBody))
	h.Paddle(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("got %d, want 200", rec.Code)
	}
	var resp map[string]string
	decodeJSON(t, rec, &resp)
	if resp["status"] != "already processed" {
		t.Errorf("got status %q, want %q", resp["status"], "already processed")
	}
}

func TestWebhookHandler_Paddle_ServiceError(t *testing.T) {
	h := handler.NewWebhookHandler(&mockBillingService{
		ProcessEventFn: func(_ context.Context, _ billingsvc.PaddleEvent, _ []byte) (bool, error) {
			return false, errors.New("db error")
		},
	}, nil)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(validEventBody))
	h.Paddle(rec, req)
	if rec.Code != http.StatusInternalServerError {
		t.Errorf("got %d, want 500", rec.Code)
	}
}
