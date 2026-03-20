package reqid_test

import (
	"context"
	"testing"

	"github.com/nyasha-hama/burnout-predictor-api/internal/reqid"
)

func TestSetAndFromCtx(t *testing.T) {
	ctx := reqid.Set(context.Background(), "test-id-123")
	got := reqid.FromCtx(ctx)
	if got != "test-id-123" {
		t.Errorf("expected test-id-123, got %q", got)
	}
}

func TestFromCtx_EmptyWhenNotSet(t *testing.T) {
	got := reqid.FromCtx(context.Background())
	if got != "" {
		t.Errorf("expected empty, got %q", got)
	}
}
