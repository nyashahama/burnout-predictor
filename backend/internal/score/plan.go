package score

import (
	"fmt"
	"regexp"
	"strings"
)

// note keyword matchers — compiled once at package init.
var (
	reDeadline = regexp.MustCompile(`(?i)deadline|deliver|launch|submit|due`)
	reMeetings = regexp.MustCompile(`(?i)meeting|call|sync|standup|review|presentation|demo`)
	reSleep    = regexp.MustCompile(`(?i)sleep|tired|exhausted|rest|insomnia`)
	reTravel   = regexp.MustCompile(`(?i)travel|flight|hotel|trip`)
	reFamily   = regexp.MustCompile(`(?i)family|kid|child|parent`)
)

// RecoveryPlanInput carries the data that personalises the recovery plan.
type RecoveryPlanInput struct {
	Note            string // user's free-text note for today
	Stress          int    // 1–5
	ConsecutiveDays int    // consecutive danger days before today
	Role            Role
}

// BuildDynamicRecoveryPlan returns a three-section plan (Tonight / Tomorrow /
// This week) personalised by keyword-matching the note, stress level,
// consecutive danger days, and role.
//
// This is the rule-based fallback used when the OpenAI call is unavailable
// or times out, and for stress < 4 / no note cases where AI is not called.
func BuildDynamicRecoveryPlan(in RecoveryPlanInput) []PlanSection {
	n := strings.ToLower(in.Note)

	hasDeadline := reDeadline.MatchString(n)
	hasMeetings := reMeetings.MatchString(n)
	hasSleep := reSleep.MatchString(n)
	hasTravel := reTravel.MatchString(n)
	hasFamily := reFamily.MatchString(n)

	// ── Tonight ───────────────────────────────────────────────────────────────
	var tonight []string
	if hasSleep || in.Stress >= 4 {
		tonight = append(tonight,
			"Hard-stop work by 8 PM. Laptop closed, no exceptions.",
			"Set a 10 PM sleep alarm — 8 hours is your fastest recovery lever.",
			"No screens in the last 30 minutes before bed.",
		)
	} else {
		tonight = append(tonight,
			"Wind down by 9 PM — don't let relief from a calmer day become an excuse to push.",
			"Protect sleep over everything else tonight.",
		)
	}

	// ── Tomorrow ──────────────────────────────────────────────────────────────
	var tomorrow []string
	switch {
	case hasDeadline:
		tomorrow = append(tomorrow,
			"Block the first 90 minutes of tomorrow for the actual deliverable — before email or Slack.",
			"Identify one thing on tomorrow's list that can slip without real consequence. Move it.",
		)
	case hasMeetings:
		tomorrow = append(tomorrow,
			"Audit tomorrow's calendar now. Convert one sync to async before you close the laptop.",
			"Block 9–11 AM as a protected focus window before the day fills.",
		)
	default:
		tomorrow = append(tomorrow,
			"Block 9–11 AM as a no-meeting deep-work window before your calendar fills.",
			"Take a 20-minute walk at lunch — leave your phone at your desk.",
		)
	}
	if hasTravel {
		tomorrow = append(tomorrow,
			"Travel compounds load. Protect sleep over everything else while you're out.",
		)
	}
	if hasFamily {
		tomorrow = append(tomorrow,
			"Protect one uninterrupted hour with family tomorrow — leave the phone in another room.",
		)
	}

	// ── This week ─────────────────────────────────────────────────────────────
	var week []string
	if in.ConsecutiveDays >= 2 {
		week = append(week, fmt.Sprintf(
			"%d consecutive hard days. One thing needs to come off your plate — a meeting converted to async, a deadline pushed, something.",
			in.ConsecutiveDays+1,
		))
	}
	if in.Role == RoleFounder || in.Role == RoleManager {
		week = append(week,
			"Identify one decision you've been carrying that can be delegated or dropped this week.",
		)
	}
	week = append(week, "Protect at least one evening this week from any work.")
	if in.Stress >= 4 {
		week = append(week, "Keep meetings under 4 per day through the end of the week.")
	}

	return []PlanSection{
		{Timing: "Tonight", Actions: tonight},
		{Timing: "Tomorrow", Actions: tomorrow},
		{Timing: "This week", Actions: week},
	}
}

// StaticRecoveryPlan returns the default plan shown when no check-in exists.
// Matches the hardcoded recoveryPlan constant in data.ts.
func StaticRecoveryPlan() []PlanSection {
	return []PlanSection{
		{
			Timing: "Tonight",
			Actions: []string{
				"Hard-stop work at 7 PM. Close the laptop, no exceptions.",
				"Set a 10 PM sleep alarm — aim for 8 hours minimum.",
				"No screens in the last 30 minutes before bed.",
			},
		},
		{
			Timing: "Tomorrow",
			Actions: []string{
				"Block 9–11 AM as a no-meeting deep-work window before your calendar fills.",
				"Convert your 4 PM sync to an async Loom or a written update.",
				"Take a 20-minute walk at lunch — leave your phone at your desk.",
			},
		},
		{
			Timing: "This week",
			Actions: []string{
				"Keep meetings under 4 per day through Friday.",
				"Protect at least one evening this week from any work.",
			},
		},
	}
}