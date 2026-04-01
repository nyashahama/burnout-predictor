// Package validate provides pure validation helpers for API request fields.
package validate

import (
	"errors"
	"fmt"
	"net/mail"
	"strings"
	"time"
)

var validRoles = map[string]bool{
	"engineer": true, "designer": true, "pm": true,
	"manager": true, "founder": true, "other": true,
}

var validSymptoms = map[string]bool{
	"headache": true, "muscle_tension": true, "fatigue": true,
	"trouble_sleeping": true, "appetite_changes": true,
}

func Email(s string) error {
	if s == "" {
		return errors.New("email is required")
	}
	addr, err := mail.ParseAddress(s)
	if err != nil {
		return errors.New("invalid email address")
	}
	// ParseAddress accepts "Name <email>" — we only want bare addresses.
	if addr.Address != s {
		return errors.New("invalid email address")
	}
	// Require a dot in the domain part.
	at := strings.LastIndex(addr.Address, "@")
	if at < 0 || !strings.Contains(addr.Address[at+1:], ".") {
		return errors.New("email must have a domain with a dot")
	}
	return nil
}

func Role(s string) error {
	if s == "" {
		return nil
	}
	if !validRoles[s] {
		return errors.New("role must be one of: engineer, designer, pm, manager, founder, other")
	}
	return nil
}

func Timezone(s string) error {
	if s == "" {
		return nil
	}
	if _, err := time.LoadLocation(s); err != nil {
		return errors.New("invalid timezone")
	}
	return nil
}

func SleepBaseline(v int16) error {
	if v < 4 || v > 12 {
		return errors.New("sleep_baseline must be between 4 and 12")
	}
	return nil
}

func EstimatedScore(v int16) error {
	if v < 8 || v > 92 {
		return errors.New("estimated_score must be between 8 and 92")
	}
	return nil
}

func NoteLength(s string) error {
	if len([]rune(s)) > 280 {
		return errors.New("note must be 280 characters or fewer")
	}
	return nil
}

func Password(s string) error {
	if len(s) < 8 {
		return errors.New("password must be at least 8 characters")
	}
	return nil
}

func ReminderTime(s string) error {
	if s == "" {
		return nil
	}
	if _, err := time.Parse("15:04", s); err != nil {
		return errors.New("reminder_time must be a valid time in HH:MM format")
	}
	return nil
}

// CheckinSignals validates the optional adaptive check-in fields.
// Returns an error describing the first invalid field, or nil.
func CheckinSignals(energy, focus *int, hours *float64, symptoms []string) error {
	if energy != nil && (*energy < 1 || *energy > 5) {
		return errors.New("energy_level must be between 1 and 5")
	}
	if focus != nil && (*focus < 1 || *focus > 5) {
		return errors.New("focus_quality must be between 1 and 5")
	}
	if hours != nil && (*hours < 0 || *hours > 24) {
		return errors.New("hours_worked must be between 0 and 24")
	}
	for _, s := range symptoms {
		if !validSymptoms[s] {
			return fmt.Errorf("unknown symptom: %s", s)
		}
	}
	return nil
}
