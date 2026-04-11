package payment

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log/slog"
	"os"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	db "github.com/nyasha-hama/burnout-predictor-api/internal/db/sqlc"
)

const (
	PlanPro  = "pro"
	PlanTeam = "team"

	StatusPending  = "pending"
	StatusVerified = "verified"
	StatusRejected = "rejected"
	StatusExpired  = "expired"

	DefaultProPriceRands  = 14900 // R149.00 in cents
	DefaultTeamPriceRands = 49900 // R499.00 in cents
	PaymentExpiryDays     = 7     // Reference expires after 7 days
)

var planPrices = map[string]int{
	PlanPro:  DefaultProPriceRands,
	PlanTeam: DefaultTeamPriceRands,
}

func GetPlanPrice(planName string) int {
	if price, ok := planPrices[planName]; ok {
		return price
	}
	return DefaultProPriceRands
}

func getEFTBankDetails() BankDetails {
	return BankDetails{
		AccountName:   getEnv("EFT_ACCOUNT_NAME", "Overload"),
		BankName:      getEnv("EFT_BANK_NAME", "FNB"),
		AccountNumber: getEnv("EFT_ACCOUNT_NUMBER", "1234567890"),
		BranchCode:    getEnv("EFT_BRANCH_CODE", "250655"),
		AccountType:   getEnv("EFT_ACCOUNT_TYPE", "Business Cheque"),
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

// paymentStore is the data-access contract for the payment service.
type paymentStore interface {
	CreateEFTPayment(ctx context.Context, params db.CreateEFTPaymentParams) (db.EftPayment, error)
	GetEFTPaymentByReference(ctx context.Context, reference string) (db.EftPayment, error)
	GetEFTPaymentByID(ctx context.Context, id uuid.UUID) (db.EftPayment, error)
	GetPendingEFTPayments(ctx context.Context) ([]db.EftPayment, error)
	UpdateEFTPaymentStatus(ctx context.Context, params db.UpdateEFTPaymentStatusParams) error
	GetUserByID(ctx context.Context, id uuid.UUID) (db.User, error)
	GetActiveSubscriptionByUserID(ctx context.Context, userID uuid.UUID) (db.Subscription, error)
	UpsertEftSubscription(ctx context.Context, params db.UpsertEftSubscriptionParams) (db.Subscription, error)
	SetUserTier(ctx context.Context, params db.SetUserTierParams) error
	UpdateUserEFTReference(ctx context.Context, params db.UpdateUserEFTReferenceParams) error
}

// Service handles EFT payment processing.
type Service struct {
	store paymentStore
	log   *slog.Logger
}

func New(store paymentStore, log *slog.Logger) *Service {
	return &Service{store: store, log: log}
}

// BankDetails contains EFT banking information.
type BankDetails struct {
	AccountName   string `json:"account_name"`
	BankName      string `json:"bank_name"`
	AccountNumber string `json:"account_number"`
	BranchCode    string `json:"branch_code"`
	AccountType   string `json:"account_type"`
}

// InitPaymentRequest is the input for initiating a new EFT payment.
type InitPaymentRequest struct {
	UserID   uuid.UUID
	PlanName string
}

// InitPaymentResponse is the output after initiating an EFT payment.
type InitPaymentResponse struct {
	PaymentID   uuid.UUID   `json:"payment_id"`
	Reference   string      `json:"reference"`
	Amount      int         `json:"amount_cents"`
	Currency    string      `json:"currency"`
	PlanName    string      `json:"plan_name"`
	ExpiresAt   time.Time   `json:"expires_at"`
	BankDetails BankDetails `json:"bank_details"`
}

// PendingPayment represents a payment awaiting verification.
type PendingPayment struct {
	ID            uuid.UUID `json:"id"`
	UserID        uuid.UUID `json:"user_id"`
	UserEmail     string    `json:"user_email"`
	UserName      string    `json:"user_name"`
	Reference     string    `json:"reference"`
	AmountCents   int       `json:"amount_cents"`
	Currency      string    `json:"currency"`
	PlanName      string    `json:"plan_name"`
	Status        string    `json:"status"`
	ProofImageURL string    `json:"proof_image_url,omitempty"`
	CreatedAt     time.Time `json:"created_at"`
	ExpiresAt     time.Time `json:"expires_at"`
}

// VerifyPaymentRequest is the input for verifying a payment.
type VerifyPaymentRequest struct {
	AdminUserID uuid.UUID
	Action      string // "approve" or "reject"
	Note        string
}

// Init initiates a new EFT payment for a user.
func (s *Service) Init(ctx context.Context, req InitPaymentRequest) (*InitPaymentResponse, error) {
	if req.PlanName != PlanPro && req.PlanName != PlanTeam {
		return nil, ErrInvalidPlan
	}

	// Check if user already has active subscription
	existingSub, err := s.store.GetActiveSubscriptionByUserID(ctx, req.UserID)
	if err == nil && existingSub.ID != (uuid.UUID{}) {
		if existingSub.Status == "active" || existingSub.Status == "trialing" {
			return nil, ErrUserAlreadySubscribed
		}
	}

	// Generate unique reference
	ref, err := generateReference(req.UserID.String())
	if err != nil {
		return nil, fmt.Errorf("generate reference: %w", err)
	}

	amount := GetPlanPrice(req.PlanName)
	expiresAt := time.Now().AddDate(0, 0, PaymentExpiryDays)

	// Create payment record
	payment, err := s.store.CreateEFTPayment(ctx, db.CreateEFTPaymentParams{
		UserID:      req.UserID,
		Reference:   ref,
		AmountCents: int32(amount),
		Currency:    "ZAR",
		PlanName:    req.PlanName,
		Status:      StatusPending,
		ExpiresAt:   pgtype.Timestamptz{Time: expiresAt, Valid: true},
	})
	if err != nil {
		return nil, fmt.Errorf("create payment: %w", err)
	}

	// Update user's EFT reference for easier lookup
	_ = s.store.UpdateUserEFTReference(ctx, db.UpdateUserEFTReferenceParams{
		ID:                  req.UserID,
		EftPaymentReference: pgtype.Text{String: ref, Valid: true},
	})

	s.log.InfoContext(ctx, "eft: payment initiated",
		"payment_id", payment.ID,
		"user_id", req.UserID,
		"reference", ref,
		"plan", req.PlanName,
		"amount_cents", amount,
	)

	return &InitPaymentResponse{
		PaymentID:   payment.ID,
		Reference:   ref,
		Amount:      amount,
		Currency:    "ZAR",
		PlanName:    req.PlanName,
		ExpiresAt:   expiresAt,
		BankDetails: getEFTBankDetails(),
	}, nil
}

// GetPending returns all pending payments for admin verification.
func (s *Service) GetPending(ctx context.Context) ([]PendingPayment, error) {
	rows, err := s.store.GetPendingEFTPayments(ctx)
	if err != nil {
		return nil, err
	}

	result := make([]PendingPayment, 0, len(rows))
	for _, row := range rows {
		user, err := s.store.GetUserByID(ctx, row.UserID)
		if err != nil {
			s.log.WarnContext(ctx, "eft: failed to load user for pending payment",
				"payment_id", row.ID, "user_id", row.UserID, "err", err)
			continue
		}

		result = append(result, PendingPayment{
			ID:            row.ID,
			UserID:        row.UserID,
			UserEmail:     user.Email,
			UserName:      user.Name,
			Reference:     row.Reference,
			AmountCents:   int(row.AmountCents),
			Currency:      row.Currency,
			PlanName:      row.PlanName,
			Status:        row.Status,
			ProofImageURL: row.ProofImageUrl.String,
			CreatedAt:     row.CreatedAt.Time,
			ExpiresAt:     row.ExpiresAt.Time,
		})
	}

	return result, nil
}

// Verify approves or rejects a pending payment.
func (s *Service) Verify(ctx context.Context, paymentID uuid.UUID, req VerifyPaymentRequest) error {
	payment, err := s.store.GetEFTPaymentByID(ctx, paymentID)
	if err != nil {
		if err == pgx.ErrNoRows {
			return ErrPaymentNotFound
		}
		return fmt.Errorf("get payment: %w", err)
	}

	if payment.Status != StatusPending {
		return fmt.Errorf("payment is not pending (status: %s)", payment.Status)
	}

	if time.Now().After(payment.ExpiresAt.Time) {
		return ErrPaymentExpired
	}

	var newStatus string
	switch req.Action {
	case "approve":
		newStatus = StatusVerified

		periodEnd := time.Now().AddDate(0, 1, 0)
		_, err := s.store.UpsertEftSubscription(ctx, db.UpsertEftSubscriptionParams{
			UserID:             payment.UserID,
			PlanName:           payment.PlanName,
			Currency:           payment.Currency,
			UnitPriceCents:     pgtype.Int4{Int32: payment.AmountCents, Valid: true},
			Status:             "active",
			PaymentMethod:      pgtype.Text{String: "eft", Valid: true},
			EftPaymentID:       pgtype.UUID{Bytes: payment.ID, Valid: true},
			CurrentPeriodStart: pgtype.Timestamptz{Time: time.Now(), Valid: true},
			CurrentPeriodEnd:   pgtype.Timestamptz{Time: periodEnd, Valid: true},
		})

		if err != nil {
			return fmt.Errorf("upsert subscription: %w", err)
		}

		if err := s.store.SetUserTier(ctx, db.SetUserTierParams{
			ID:   payment.UserID,
			Tier: payment.PlanName,
		}); err != nil {
			return fmt.Errorf("set user tier: %w", err)
		}

		s.log.InfoContext(ctx, "eft: payment approved",
			"payment_id", paymentID,
			"user_id", payment.UserID,
			"admin_id", req.AdminUserID,
			"plan", payment.PlanName,
		)

	case "reject":
		newStatus = StatusRejected

		s.log.InfoContext(ctx, "eft: payment rejected",
			"payment_id", paymentID,
			"user_id", payment.UserID,
			"admin_id", req.AdminUserID,
			"note", req.Note,
		)

	default:
		return fmt.Errorf("invalid action: %s (must be 'approve' or 'reject')", req.Action)
	}

	err = s.store.UpdateEFTPaymentStatus(ctx, db.UpdateEFTPaymentStatusParams{
		ID:            paymentID,
		Status:        newStatus,
		VerifiedBy:    pgtype.UUID{Bytes: req.AdminUserID, Valid: true},
		VerifiedAt:    pgtype.Timestamptz{Time: time.Now(), Valid: true},
		RejectionNote: pgtype.Text{String: req.Note, Valid: req.Note != ""},
	})
	if err != nil {
		return fmt.Errorf("update status: %w", err)
	}

	return nil
}

// generateReference creates a unique payment reference.
// Format: OVR-{first 8 chars of uuid}-{random 4 chars}.
func generateReference(userID string) (string, error) {
	buf := make([]byte, 4)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	randomHex := hex.EncodeToString(buf)
	uid := uuid.MustParse(userID)
	return fmt.Sprintf("OVR-%s-%s", uid.String()[:8], randomHex), nil
}
