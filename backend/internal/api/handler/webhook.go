package handler

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"

	"github.com/nyasha-hama/burnout-predictor-api/internal/api/respond"
	billingsvc "github.com/nyasha-hama/burnout-predictor-api/internal/service/billing"
)

type billingService interface {
	ProcessEvent(ctx context.Context, event billingsvc.PaddleEvent, rawBody []byte) (alreadyProcessed bool, err error)
}

// WebhookHandler handles Paddle webhook delivery.
type WebhookHandler struct {
	billing      billingService
	paddleSecret []byte // nil = signature check skipped
}

func NewWebhookHandler(billing billingService, paddleSecret []byte) *WebhookHandler {
	return &WebhookHandler{billing: billing, paddleSecret: paddleSecret}
}

// Paddle handles POST /api/webhooks/paddle.
func (h *WebhookHandler) Paddle(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		respond.Error(w, http.StatusBadRequest, "could not read body")
		return
	}

	if len(h.paddleSecret) > 0 {
		if !verifyPaddleSignature(h.paddleSecret, r.Header.Get("Paddle-Signature"), body) {
			respond.Error(w, http.StatusUnauthorized, "invalid signature")
			return
		}
	}

	var event billingsvc.PaddleEvent
	if err := json.Unmarshal(body, &event); err != nil || event.EventID == "" {
		respond.Error(w, http.StatusBadRequest, "invalid event payload")
		return
	}

	alreadyProcessed, err := h.billing.ProcessEvent(r.Context(), event, body)
	if err != nil {
		log.Printf("webhook/paddle: process event %s: %v", event.EventID, err)
		respond.Error(w, http.StatusInternalServerError, "server error")
		return
	}
	if alreadyProcessed {
		respond.JSON(w, http.StatusOK, map[string]string{"status": "already processed"})
		return
	}

	respond.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// verifyPaddleSignature validates the Paddle-Signature header (HMAC-SHA256).
// Header format: ts=<unix>;<whitespace>h1=<hex-hmac>
// Signed payload: "<ts>:<raw body>"
func verifyPaddleSignature(secret []byte, header string, body []byte) bool {
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
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(ts + ":" + string(body)))
	expected := fmt.Sprintf("%x", mac.Sum(nil))
	return hmac.Equal([]byte(expected), []byte(sig))
}
