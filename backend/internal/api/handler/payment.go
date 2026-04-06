package handler

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/google/uuid"

	"github.com/nyasha-hama/burnout-predictor-api/internal/api/middleware"
	"github.com/nyasha-hama/burnout-predictor-api/internal/api/respond"
	"github.com/nyasha-hama/burnout-predictor-api/internal/service/payment"
)

type paymentService interface {
	Init(ctx context.Context, req payment.InitPaymentRequest) (*payment.InitPaymentResponse, error)
	GetPending(ctx context.Context) ([]payment.PendingPayment, error)
	Verify(ctx context.Context, paymentID uuid.UUID, req payment.VerifyPaymentRequest) error
}

// PaymentHandler handles payment-related endpoints.
type PaymentHandler struct {
	svc paymentService
}

func NewPaymentHandler(svc paymentService) *PaymentHandler {
	return &PaymentHandler{svc: svc}
}

// InitResponse is the JSON response for payment initiation.
type InitResponse struct {
	PaymentID   uuid.UUID           `json:"payment_id"`
	Reference   string              `json:"reference"`
	Amount      int                 `json:"amount_cents"`
	Currency    string              `json:"currency"`
	PlanName    string              `json:"plan_name"`
	ExpiresAt   string              `json:"expires_at"`
	BankDetails payment.BankDetails `json:"bank_details"`
}

// Init handles POST /api/payments/init.
func (h *PaymentHandler) Init(w http.ResponseWriter, r *http.Request) {
	user := middleware.UserFromCtx(r.Context())

	var req struct {
		PlanName string `json:"plan_name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respond.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.PlanName != "pro" && req.PlanName != "team" {
		respond.Error(w, http.StatusBadRequest, "plan_name must be 'pro' or 'team'")
		return
	}

	result, err := h.svc.Init(r.Context(), payment.InitPaymentRequest{
		UserID:   user.ID,
		PlanName: req.PlanName,
	})
	if err != nil {
		if err == payment.ErrUserAlreadySubscribed {
			respond.Error(w, http.StatusConflict, "user already has active subscription")
			return
		}
		respond.ServiceError(w, err)
		return
	}

	respond.JSON(w, http.StatusOK, InitResponse{
		PaymentID: result.PaymentID,
		Reference: result.Reference,
		Amount:    result.Amount,
		Currency:  result.Currency,
		PlanName:  result.PlanName,
		ExpiresAt: result.ExpiresAt.Format("2006-01-02T15:04:05Z07:00"),
		BankDetails: payment.BankDetails{
			AccountName:   result.BankDetails.AccountName,
			BankName:      result.BankDetails.BankName,
			AccountNumber: result.BankDetails.AccountNumber,
			BranchCode:    result.BankDetails.BranchCode,
			AccountType:   result.BankDetails.AccountType,
		},
	})
}

// PendingPaymentsResponse is the JSON response for pending payments list.
type PendingPaymentsResponse struct {
	Payments []payment.PendingPayment `json:"payments"`
}

// GetPending handles GET /api/admin/payments (admin only).
func (h *PaymentHandler) GetPending(w http.ResponseWriter, r *http.Request) {
	payments, err := h.svc.GetPending(r.Context())
	if err != nil {
		respond.ServiceError(w, err)
		return
	}

	if payments == nil {
		payments = []payment.PendingPayment{}
	}

	respond.JSON(w, http.StatusOK, PendingPaymentsResponse{Payments: payments})
}

// VerifyRequest is the JSON body for payment verification.
type VerifyRequest struct {
	Action string `json:"action"` // "approve" or "reject"
	Note   string `json:"note"`
}

// Verify handles POST /api/admin/payments/:id/verify (admin only).
func (h *PaymentHandler) Verify(w http.ResponseWriter, r *http.Request) {
	adminUser := middleware.UserFromCtx(r.Context())

	paymentIDStr := r.PathValue("id")
	paymentID, err := uuid.Parse(paymentIDStr)
	if err != nil {
		respond.Error(w, http.StatusBadRequest, "invalid payment id")
		return
	}

	var req VerifyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respond.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Action != "approve" && req.Action != "reject" {
		respond.Error(w, http.StatusBadRequest, "action must be 'approve' or 'reject'")
		return
	}

	if err := h.svc.Verify(r.Context(), paymentID, payment.VerifyPaymentRequest{
		AdminUserID: adminUser.ID,
		Action:      req.Action,
		Note:        req.Note,
	}); err != nil {
		if err == payment.ErrPaymentNotFound {
			respond.Error(w, http.StatusNotFound, "payment not found")
			return
		}
		if err == payment.ErrPaymentExpired {
			respond.Error(w, http.StatusBadRequest, "payment has expired")
			return
		}
		respond.ServiceError(w, err)
		return
	}

	respond.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
