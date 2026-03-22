package validate_test

import (
	"testing"

	"github.com/nyasha-hama/burnout-predictor-api/internal/api/validate"
)

func TestCheckinSignals_valid(t *testing.T) {
	energy := 3
	focus := 4
	hours := 8.0
	if err := validate.CheckinSignals(&energy, &focus, &hours, []string{"fatigue"}); err != nil {
		t.Errorf("expected no error, got: %v", err)
	}
}

func TestCheckinSignals_invalidEnergy(t *testing.T) {
	energy := 6
	if err := validate.CheckinSignals(&energy, nil, nil, nil); err == nil {
		t.Error("expected error for energy_level=6")
	}
}

func TestCheckinSignals_invalidHours(t *testing.T) {
	hours := 25.0
	if err := validate.CheckinSignals(nil, nil, &hours, nil); err == nil {
		t.Error("expected error for hours_worked=25")
	}
}

func TestCheckinSignals_unknownSymptom(t *testing.T) {
	if err := validate.CheckinSignals(nil, nil, nil, []string{"nausea"}); err == nil {
		t.Error("expected error for unknown symptom")
	}
}

func TestCheckinSignals_allNil(t *testing.T) {
	if err := validate.CheckinSignals(nil, nil, nil, nil); err != nil {
		t.Errorf("expected no error for all-nil inputs, got: %v", err)
	}
}

func TestCheckinSignals_invalidFocus(t *testing.T) {
	focus := 0
	if err := validate.CheckinSignals(nil, &focus, nil, nil); err == nil {
		t.Error("expected error for focus_quality=0")
	}
}

func TestCheckinSignals_hoursBoundaries(t *testing.T) {
	zero := 0.0
	if err := validate.CheckinSignals(nil, nil, &zero, nil); err != nil {
		t.Errorf("expected hours_worked=0 to be valid, got: %v", err)
	}
	max := 24.0
	if err := validate.CheckinSignals(nil, nil, &max, nil); err != nil {
		t.Errorf("expected hours_worked=24 to be valid, got: %v", err)
	}
}

func TestEmail(t *testing.T) {
	valid := []string{
		"user@example.com",
		"user+tag@sub.domain.org",
		"user.name@example.co.uk",
	}
	invalid := []string{
		"",
		"notanemail",
		"@nodomain.com",
		"x@y",                          // no TLD — must fail
		"missingat.com",
		"double@@example.com",
		"Alice <alice@example.com>",    // name-addr format — must fail
	}
	for _, e := range valid {
		if err := validate.Email(e); err != nil {
			t.Errorf("Email(%q) got error %v, want nil", e, err)
		}
	}
	for _, e := range invalid {
		if err := validate.Email(e); err == nil {
			t.Errorf("Email(%q) got nil, want error", e)
		}
	}
}
