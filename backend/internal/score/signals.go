package score

import "fmt"

// buildSignals constructs the ordered signal list shown on the ScoreCard.
// todayStress is nil when no check-in exists yet (pending state).
// meetingCount < 0 means calendar is not connected.
func buildSignals(todayStress *int, role Role, sleep SleepBaseline, meetingCount int) []Signal {
	var signals []Signal

	// ── Sleep signal ──────────────────────────────────────────────────────────
	hours := int(sleep)
	var sleepDetail string
	var sleepLevel Level
	switch {
	case hours <= 6:
		sleepDetail = fmt.Sprintf("%dh target — chronic deficit, little recovery margin", hours)
		sleepLevel = LevelDanger
	case hours == 7:
		sleepDetail = "7h target — slightly below the ideal recovery window"
		sleepLevel = LevelWarning
	default:
		sleepDetail = fmt.Sprintf("%dh target — solid recovery capacity", hours)
		sleepLevel = LevelOK
	}
	signals = append(signals, Signal{
		Label:  "Your sleep",
		Detail: sleepDetail,
		Val:    fmt.Sprintf("%dh", hours),
		Level:  sleepLevel,
	})

	// ── Stress signal ─────────────────────────────────────────────────────────
	if todayStress != nil {
		type stressMeta struct {
			detail string
			val    string
			level  Level
		}
		stressMap := map[int]stressMeta{
			1: {"You're running calm — protect this", "Very calm", LevelOK},
			2: {"Good baseline — keep protecting sleep", "Relaxed", LevelOK},
			3: {"Manageable — watch for accumulation", "Moderate", LevelWarning},
			4: {"Elevated — your body is working hard", "Stressed", LevelWarning},
			5: {"High — take action today, not tomorrow", "Overwhelmed", LevelDanger},
		}
		if m, ok := stressMap[*todayStress]; ok {
			signals = append(signals, Signal{
				Label:  "How you carried it",
				Detail: m.detail,
				Val:    m.val,
				Level:  m.level,
			})
		}
	} else {
		signals = append(signals, Signal{
			Label:  "Today's check-in",
			Detail: "Check in below to factor today's stress into your score",
			Val:    "Pending",
			Level:  LevelWarning,
		})
	}

	// ── Calendar signal (only when connected) ─────────────────────────────────
	if meetingCount >= 0 {
		var calDetail string
		var calVal string
		var calLevel Level
		switch {
		case meetingCount == 0:
			calDetail = "No meetings today — full deep-work capacity"
			calVal = "Clear"
			calLevel = LevelOK
		case meetingCount <= 2:
			calDetail = fmt.Sprintf("%d meeting%s today — manageable", meetingCount, plural(meetingCount))
			calVal = "Light"
			calLevel = LevelOK
		case meetingCount <= 4:
			calDetail = fmt.Sprintf("%d meetings today — protect at least one focus block", meetingCount)
			calVal = "Moderate"
			calLevel = LevelWarning
		case meetingCount <= 6:
			calDetail = fmt.Sprintf("%d meetings today — deep work will be hard to protect", meetingCount)
			calVal = "Heavy"
			calLevel = LevelWarning
		default:
			calDetail = fmt.Sprintf("%d meetings today — no deep-work blocks detected", meetingCount)
			calVal = "Overloaded"
			calLevel = LevelDanger
		}
		signals = append(signals, Signal{
			Label:  "Calendar density",
			Detail: calDetail,
			Val:    calVal,
			Level:  calLevel,
		})
	}

	// ── Role signal ───────────────────────────────────────────────────────────
	type roleMeta struct {
		detail string
		val    string
		level  Level
	}
	roleMap := map[Role]roleMeta{
		RoleFounder:  {"Founders carry ambient pressure most tools don't measure", "Very high", LevelDanger},
		RoleManager:  {"Managing people adds invisible overhead your calendar doesn't show", "Elevated", LevelWarning},
		RolePM:       {"Coordination overhead elevates your baseline", "Moderate+", LevelWarning},
		RoleEngineer: {"Deep work role — protecting focus blocks is key", "Baseline", LevelOK},
		RoleDesigner: {"Creative role — lower ambient pressure baseline", "Low baseline", LevelOK},
		RoleOther:    {"Your role contributes to your baseline load", "Baseline", LevelOK},
	}
	if rm, ok := roleMap[role]; ok {
		signals = append(signals, Signal{
			Label:  "Your role",
			Detail: rm.detail,
			Val:    rm.val,
			Level:  rm.level,
		})
	}

	return signals
}

func plural(n int) string {
	if n == 1 {
		return ""
	}
	return "s"
}