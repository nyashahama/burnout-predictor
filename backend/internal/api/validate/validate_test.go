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
