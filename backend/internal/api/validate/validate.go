// Package validate provides pure validation helpers for API request fields.
package validate

import (
	"errors"
	"strings"
	"time"
)

var validRoles = map[string]bool{
	"engineer": true, "designer": true, "pm": true,
	"manager": true, "founder": true, "other": true,
}

func Email(s string) error {
	at := strings.LastIndex(s, "@")
	if at < 1 {
		return errors.New("email must contain @")
	}
	if strings.LastIndex(s[at:], ".") < 2 {
		return errors.New("email must have a domain with a dot after @")
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
