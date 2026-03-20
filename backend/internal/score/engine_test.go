package score

import (
	"testing"
	"time"
)

// ── helpers ───────────────────────────────────────────────────────────────────

func intPtr(n int) *int { return &n }

func mustDate(s string) time.Time {
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		panic(err)
	}
	return t
}

// dayNameFixed always returns the same day name regardless of real date.
// Used in trajectory tests to make assertions deterministic.
func dayNameFixed(name string) func(int) string {
	return func(_ int) string { return name }
}

// ── Calculate ─────────────────────────────────────────────────────────────────

func TestCalculate_NilStressReturnsEstimate(t *testing.T) {
	est := 62
	out := Calculate(Input{
		TodayStress:    nil,
		Role:           RoleEngineer,
		SleepBaseline:  Sleep8,
		EstimatedScore: &est,
	})
	if out.Score != 62 {
		t.Errorf("expected 62, got %d", out.Score)
	}
	if out.Level != LevelWarning {
		t.Errorf("expected warning for 62, got %s", out.Level)
	}
}

func TestCalculate_NilStressNilEstimateDefault(t *testing.T) {
	out := Calculate(Input{
		TodayStress:    nil,
		Role:           RoleEngineer,
		SleepBaseline:  Sleep8,
		EstimatedScore: nil,
	})
	if out.Score != 55 {
		t.Errorf("expected default 55, got %d", out.Score)
	}
}

func TestCalculate_BaseScores(t *testing.T) {
	cases := []struct {
		stress int
		want   int // engineer, 8h sleep, no trend, no calendar
	}{
		{1, 22},
		{2, 35},
		{3, 50},
		{4, 64},
		{5, 76},
	}
	for _, c := range cases {
		out := Calculate(Input{
			TodayStress:   intPtr(c.stress),
			Role:          RoleEngineer,
			SleepBaseline: Sleep8,
			MeetingCount:  -1,
		})
		if out.Score != c.want {
			t.Errorf("stress=%d: expected %d, got %d", c.stress, c.want, out.Score)
		}
	}
}

func TestCalculate_RoleModifiers(t *testing.T) {
	cases := []struct {
		role Role
		mod  int
	}{
		{RoleFounder, 6},
		{RoleManager, 3},
		{RolePM, 2},
		{RoleEngineer, 0},
		{RoleDesigner, -2},
		{RoleOther, 0},
	}
	for _, c := range cases {
		out := Calculate(Input{
			TodayStress:   intPtr(3), // base 50
			Role:          c.role,
			SleepBaseline: Sleep8,
			MeetingCount:  -1,
		})
		want := clamp(50+c.mod, 8, 92)
		if out.Score != want {
			t.Errorf("role=%s: expected %d, got %d", c.role, want, out.Score)
		}
	}
}

func TestCalculate_SleepModifiers(t *testing.T) {
	cases := []struct {
		sleep SleepBaseline
		mod   int
	}{
		{Sleep6, 10},
		{Sleep7, 5},
		{Sleep8, 0},
		{Sleep9, -4},
	}
	for _, c := range cases {
		out := Calculate(Input{
			TodayStress:   intPtr(3), // base 50
			Role:          RoleEngineer,
			SleepBaseline: c.sleep,
			MeetingCount:  -1,
		})
		want := clamp(50+c.mod, 8, 92)
		if out.Score != want {
			t.Errorf("sleep=%d: expected %d, got %d", c.sleep, want, out.Score)
		}
	}
}

func TestCalculate_RecentTrendModifier(t *testing.T) {
	// avg stress 4 → (4-3)*2.5 = +2.5 → rounded +3
	out := Calculate(Input{
		TodayStress:    intPtr(3),
		Role:           RoleEngineer,
		SleepBaseline:  Sleep8,
		RecentStresses: []int{4, 4, 4},
		MeetingCount:   -1,
	})
	// base 50 + trend +3 = 53
	if out.Score != 53 {
		t.Errorf("expected 53, got %d", out.Score)
	}
}

func TestCalculate_RecentTrendBelowNeutral(t *testing.T) {
	// avg stress 2 → (2-3)*2.5 = -2.5 → rounded -3
	out := Calculate(Input{
		TodayStress:    intPtr(3),
		Role:           RoleEngineer,
		SleepBaseline:  Sleep8,
		RecentStresses: []int{2, 2, 2},
		MeetingCount:   -1,
	})
	// base 50 - 3 = 47
	if out.Score != 47 {
		t.Errorf("expected 47, got %d", out.Score)
	}
}

func TestCalculate_MeetingModifiers(t *testing.T) {
	cases := []struct {
		meetings int
		wantMod  int
	}{
		{-1, 0},  // not connected
		{0, 0},
		{2, 2},
		{4, 5},
		{6, 9},
		{8, 12},
	}
	for _, c := range cases {
		out := Calculate(Input{
			TodayStress:   intPtr(3), // base 50
			Role:          RoleEngineer,
			SleepBaseline: Sleep8,
			MeetingCount:  c.meetings,
		})
		want := clamp(50+c.wantMod, 8, 92)
		if out.Score != want {
			t.Errorf("meetings=%d: expected %d, got %d", c.meetings, want, out.Score)
		}
	}
}

func TestCalculate_ScoreClampedAt92(t *testing.T) {
	// stress 5 + founder(+6) + sleep4(+16) = 76+6+16 = 98 → clamped 92
	out := Calculate(Input{
		TodayStress:   intPtr(5),
		Role:          RoleFounder,
		SleepBaseline: Sleep4,
		MeetingCount:  -1,
	})
	if out.Score != 92 {
		t.Errorf("expected 92 (clamped), got %d", out.Score)
	}
}

func TestCalculate_ScoreClampedAt8(t *testing.T) {
	// stress 1 + designer(-2) + sleep9(-4) = 22-2-4 = 16 → not clamped, but test floor
	out := Calculate(Input{
		TodayStress:    intPtr(1),
		Role:           RoleDesigner,
		SleepBaseline:  Sleep9,
		RecentStresses: []int{1, 1, 1, 1, 1}, // avg 1 → (1-3)*2.5 = -5
		MeetingCount:   -1,
	})
	if out.Score < 8 {
		t.Errorf("score %d is below minimum 8", out.Score)
	}
}

func TestCalculate_SignalCountWithCalendar(t *testing.T) {
	out := Calculate(Input{
		TodayStress:   intPtr(3),
		Role:          RoleEngineer,
		SleepBaseline: Sleep8,
		MeetingCount:  5, // connected
	})
	// sleep + stress + calendar + role = 4 signals
	if len(out.Signals) != 4 {
		t.Errorf("expected 4 signals, got %d", len(out.Signals))
	}
}

func TestCalculate_SignalCountWithoutCalendar(t *testing.T) {
	out := Calculate(Input{
		TodayStress:   intPtr(3),
		Role:          RoleEngineer,
		SleepBaseline: Sleep8,
		MeetingCount:  -1, // not connected
	})
	// sleep + stress + role = 3 signals
	if len(out.Signals) != 3 {
		t.Errorf("expected 3 signals, got %d", len(out.Signals))
	}
}

func TestCalculate_SignalPendingWhenNoCheckin(t *testing.T) {
	out := Calculate(Input{
		TodayStress:   nil,
		Role:          RoleEngineer,
		SleepBaseline: Sleep8,
		MeetingCount:  -1,
	})
	found := false
	for _, s := range out.Signals {
		if s.Val == "Pending" {
			found = true
		}
	}
	if !found {
		t.Error("expected a Pending signal when no check-in")
	}
}

// ── Level helpers ─────────────────────────────────────────────────────────────

func TestScoreLevel(t *testing.T) {
	cases := []struct {
		score int
		want  Level
	}{
		{0, LevelOK},
		{40, LevelOK},
		{41, LevelWarning},
		{65, LevelWarning},
		{66, LevelDanger},
		{100, LevelDanger},
	}
	for _, c := range cases {
		if got := ScoreLevel(c.score); got != c.want {
			t.Errorf("score=%d: expected %s, got %s", c.score, c.want, got)
		}
	}
}

// ── StressToScore ─────────────────────────────────────────────────────────────

func TestStressToScore_MatchesCalculate(t *testing.T) {
	// StressToScore is Calculate without trend or calendar.
	for stress := 1; stress <= 5; stress++ {
		for _, role := range []Role{RoleEngineer, RoleFounder, RoleDesigner} {
			for _, sleep := range []SleepBaseline{Sleep7, Sleep8, Sleep9} {
				fromFunc := StressToScore(stress, role, sleep)
				fromCalc := Calculate(Input{
					TodayStress:   intPtr(stress),
					Role:          role,
					SleepBaseline: sleep,
					MeetingCount:  -1,
				}).Score
				if fromFunc != fromCalc {
					t.Errorf("stress=%d role=%s sleep=%d: StressToScore=%d Calculate=%d",
						stress, role, int(sleep), fromFunc, fromCalc)
				}
			}
		}
	}
}

// ── AccuracyLabel ─────────────────────────────────────────────────────────────

func TestAccuracyLabel(t *testing.T) {
	cases := []struct {
		count int
		empty bool
		sub   string
	}{
		{0, true, ""},
		{2, true, ""},
		{3, false, "getting smarter"},
		{7, false, "real check-ins"},
		{14, false, "most accurate"},
		{30, false, "as accurate as it gets"},
	}
	for _, c := range cases {
		got := AccuracyLabel(c.count)
		if c.empty && got != "" {
			t.Errorf("count=%d: expected empty, got %q", c.count, got)
		}
		if !c.empty && got == "" {
			t.Errorf("count=%d: expected non-empty", c.count)
		}
	}
}

// ── BuildScoreExplanation ─────────────────────────────────────────────────────

func TestBuildScoreExplanation_NilStressHighScore(t *testing.T) {
	s := BuildScoreExplanation(ExplanationInput{Score: 70, TodayStress: nil})
	if s == "" {
		t.Error("expected non-empty explanation")
	}
}

func TestBuildScoreExplanation_ConsecutiveDanger3(t *testing.T) {
	s := BuildScoreExplanation(ExplanationInput{
		Score: 72, TodayStress: intPtr(4),
		ConsecutiveDangerDays: 3,
	})
	if !containsAt(s, "3 consecutive") {
		t.Errorf("expected consecutive mention, got: %q", s)
	}
}

func TestBuildScoreExplanation_ConsecutiveDanger2(t *testing.T) {
	s := BuildScoreExplanation(ExplanationInput{
		Score: 68, TodayStress: intPtr(4),
		ConsecutiveDangerDays: 2,
	})
	if !containsAt(s, "Back-to-back") {
		t.Errorf("expected back-to-back mention, got: %q", s)
	}
}

func TestBuildScoreExplanation_Overwhelm(t *testing.T) {
	s := BuildScoreExplanation(ExplanationInput{Score: 78, TodayStress: intPtr(5)})
	if !containsAt(s, "Overwhelm") {
		t.Errorf("expected overwhelm mention, got: %q", s)
	}
}

func TestBuildScoreExplanation_CalmHighScore_WithRecentHigh(t *testing.T) {
	s := BuildScoreExplanation(ExplanationInput{
		Score: 55, TodayStress: intPtr(2),
		RecentStresses: []int{4, 5, 4},
	})
	if !containsAt(s, "better today") {
		t.Errorf("expected 'better today', got: %q", s)
	}
}

func TestBuildScoreExplanation_FullRecovery(t *testing.T) {
	s := BuildScoreExplanation(ExplanationInput{Score: 30, TodayStress: intPtr(1)})
	if !containsAt(s, "recovery looks like") {
		t.Errorf("expected recovery message, got: %q", s)
	}
}

// ── BuildSuggestion ───────────────────────────────────────────────────────────

func TestBuildSuggestion_NoCheckin(t *testing.T) {
	s := BuildSuggestion(70, false, 0)
	if !containsAt(s, "check-in below") {
		t.Errorf("expected check-in prompt, got: %q", s)
	}
}

func TestBuildSuggestion_DangerStreakWitness(t *testing.T) {
	s := BuildSuggestion(80, true, 5)
	if !containsAt(s, "consecutive days") {
		t.Errorf("expected witness message, got: %q", s)
	}
}

func TestBuildSuggestion_ScoreBands(t *testing.T) {
	cases := []struct{ score int; sub string }{
		{80, "critical load"},
		{70, "9–11 AM"},
		{55, "moderate zone"},
		{45, "sustainably"},
		{30, "in the green"},
	}
	for _, c := range cases {
		s := BuildSuggestion(c.score, true, 0)
		if !containsAt(s, c.sub) {
			t.Errorf("score=%d: expected %q in %q", c.score, c.sub, s)
		}
	}
}

// ── BuildTrajectoryInsight ────────────────────────────────────────────────────

func TestBuildTrajectoryInsight_NotEnoughData(t *testing.T) {
	s := BuildTrajectoryInsight(TrajectoryInput{
		Score:          70,
		RecentStresses: []int{4},
		DayName:        dayNameFixed("Thursday"),
	})
	if s != "" {
		t.Errorf("expected empty with <2 stresses, got: %q", s)
	}
}

func TestBuildTrajectoryInsight_4DayDanger(t *testing.T) {
	s := BuildTrajectoryInsight(TrajectoryInput{
		Score:                 72,
		RecentStresses:        []int{4, 4, 4, 4},
		ConsecutiveDangerDays: 4,
		DayName:               dayNameFixed("Thursday"),
	})
	if !containsAt(s, "4 days") {
		t.Errorf("expected 4-day message, got: %q", s)
	}
}

func TestBuildTrajectoryInsight_TrendingUp(t *testing.T) {
	s := BuildTrajectoryInsight(TrajectoryInput{
		Score:          68,
		RecentStresses: []int{4, 3, 2}, // newest first → trending up (4 >= 2)
		DayName:        dayNameFixed("Friday"),
	})
	if !containsAt(s, "building") {
		t.Errorf("expected building message, got: %q", s)
	}
}

func TestBuildTrajectoryInsight_TrendingDown(t *testing.T) {
	s := BuildTrajectoryInsight(TrajectoryInput{
		Score:          68,
		RecentStresses: []int{2, 3, 5}, // newest=2, oldest=5 → trending down
		DayName:        dayNameFixed("Saturday"),
	})
	if !containsAt(s, "ease") {
		t.Errorf("expected ease message, got: %q", s)
	}
}

// ── BuildDynamicRecoveryPlan ──────────────────────────────────────────────────

func TestBuildDynamicRecoveryPlan_AlwaysThreeSections(t *testing.T) {
	cases := []RecoveryPlanInput{
		{Note: "", Stress: 2, Role: RoleEngineer},
		{Note: "big deadline coming up", Stress: 4, Role: RoleFounder},
		{Note: "too many meetings", Stress: 5, Role: RolePM},
		{Note: "travel next week", Stress: 3, Role: RoleManager},
	}
	for _, c := range cases {
		plan := BuildDynamicRecoveryPlan(c)
		if len(plan) != 3 {
			t.Errorf("note=%q: expected 3 sections, got %d", c.Note, len(plan))
		}
		for _, section := range plan {
			if len(section.Actions) == 0 {
				t.Errorf("section %q has no actions", section.Timing)
			}
		}
	}
}

func TestBuildDynamicRecoveryPlan_DeadlineNote(t *testing.T) {
	plan := BuildDynamicRecoveryPlan(RecoveryPlanInput{
		Note: "huge deadline tomorrow", Stress: 4, Role: RoleEngineer,
	})
	// Tomorrow section should mention deliverable
	var tomorrowSection PlanSection
	for _, s := range plan {
		if s.Timing == "Tomorrow" {
			tomorrowSection = s
		}
	}
	found := false
	for _, a := range tomorrowSection.Actions {
		if containsAt(a, "deliverable") {
			found = true
		}
	}
	if !found {
		t.Error("expected deliverable mention in Tomorrow section for deadline note")
	}
}

func TestBuildDynamicRecoveryPlan_ConsecutiveDaysAddsWeekAction(t *testing.T) {
	plan := BuildDynamicRecoveryPlan(RecoveryPlanInput{
		Note: "", Stress: 4, Role: RoleEngineer, ConsecutiveDays: 3,
	})
	var weekSection PlanSection
	for _, s := range plan {
		if s.Timing == "This week" {
			weekSection = s
		}
	}
	found := false
	for _, a := range weekSection.Actions {
		if containsAt(a, "consecutive") {
			found = true
		}
	}
	if !found {
		t.Error("expected consecutive-days action in This week section")
	}
}

func TestBuildDynamicRecoveryPlan_FounderGetsDelegateAction(t *testing.T) {
	plan := BuildDynamicRecoveryPlan(RecoveryPlanInput{
		Note: "", Stress: 4, Role: RoleFounder,
	})
	var weekSection PlanSection
	for _, s := range plan {
		if s.Timing == "This week" {
			weekSection = s
		}
	}
	found := false
	for _, a := range weekSection.Actions {
		if containsAt(a, "delegated") {
			found = true
		}
	}
	if !found {
		t.Error("expected delegate action for founder")
	}
}

func TestBuildDynamicRecoveryPlan_HighStressUrgentTonight(t *testing.T) {
	plan := BuildDynamicRecoveryPlan(RecoveryPlanInput{
		Note: "", Stress: 5, Role: RoleEngineer,
	})
	var tonight PlanSection
	for _, s := range plan {
		if s.Timing == "Tonight" {
			tonight = s
		}
	}
	// High stress → Hard-stop path (3 actions)
	if len(tonight.Actions) < 3 {
		t.Errorf("expected ≥3 tonight actions for stress 5, got %d", len(tonight.Actions))
	}
}

// ── DetectPatterns ────────────────────────────────────────────────────────────

func TestDetectPatterns_RequiresMinEntries(t *testing.T) {
	entries := make([]HistoryEntry, 6)
	result := DetectPatterns(entries)
	if len(result.Patterns) != 0 {
		t.Error("expected no patterns with <7 entries")
	}
}

func TestDetectPatterns_MaxThreePatterns(t *testing.T) {
	// Build 30 days with clear Monday spikes and Sunday recoveries
	entries := make([]HistoryEntry, 30)
	base := mustDate("2025-01-01") // Wednesday
	for i := range entries {
		d := base.AddDate(0, 0, i)
		score := 50
		if d.Weekday() == time.Monday {
			score = 80 // consistent spike
		}
		if d.Weekday() == time.Sunday {
			score = 25 // consistent recovery
		}
		entries[i] = HistoryEntry{Date: d, Score: score}
	}
	result := DetectPatterns(entries)
	if len(result.Patterns) > 3 {
		t.Errorf("expected max 3 patterns, got %d", len(result.Patterns))
	}
}

// ── GetEarnedPatternInsight ───────────────────────────────────────────────────

func TestGetEarnedPatternInsight_ReturnsNilWhenNoHighDays(t *testing.T) {
	result := GetEarnedPatternInsight(EarnedPatternInsightInput{
		DOWEntries: map[int][]DOWEntry{
			1: { // Monday
				{Score: 40}, {Score: 38},
			},
		},
		LastSeenDates: map[int]time.Time{},
		Today:         mustDate("2025-03-18"),
	})
	if result != nil {
		t.Error("expected nil when scores are not high")
	}
}

func TestGetEarnedPatternInsight_ReturnsMessageWhenHighDaysPresent(t *testing.T) {
	result := GetEarnedPatternInsight(EarnedPatternInsightInput{
		DOWEntries: map[int][]DOWEntry{
			2: { // Tuesday
				{Score: 75}, {Score: 70}, {Score: 68},
			},
		},
		LastSeenDates: map[int]time.Time{},
		Today:         mustDate("2025-03-18"),
	})
	if result == nil {
		t.Fatal("expected a result")
	}
	if !containsAt(result.Message, "Tuesday") {
		t.Errorf("expected Tuesday in message, got: %q", result.Message)
	}
	if result.DOW != 2 {
		t.Errorf("expected DOW=2, got %d", result.DOW)
	}
}

func TestGetEarnedPatternInsight_CooldownPreventsRepeat(t *testing.T) {
	today := mustDate("2025-03-18")
	recentlySeen := today.AddDate(0, 0, -15) // only 15 days ago

	result := GetEarnedPatternInsight(EarnedPatternInsightInput{
		DOWEntries: map[int][]DOWEntry{
			2: {
				{Score: 75}, {Score: 70}, {Score: 68},
			},
		},
		LastSeenDates: map[int]time.Time{2: recentlySeen},
		Today:         today,
	})
	if result != nil {
		t.Error("expected nil during 30-day cooldown")
	}
}

func TestGetEarnedPatternInsight_ShowsAfterCooldown(t *testing.T) {
	today := mustDate("2025-03-18")
	oldSeen := today.AddDate(0, 0, -31) // 31 days ago, cooldown elapsed

	result := GetEarnedPatternInsight(EarnedPatternInsightInput{
		DOWEntries: map[int][]DOWEntry{
			2: {
				{Score: 75}, {Score: 70}, {Score: 68},
			},
		},
		LastSeenDates: map[int]time.Time{2: oldSeen},
		Today:         today,
	})
	if result == nil {
		t.Error("expected result after cooldown elapsed")
	}
}

// ── BuildMonthlyArc ───────────────────────────────────────────────────────────

func TestBuildMonthlyArc_NilWhenNotEnoughEntries(t *testing.T) {
	result := BuildMonthlyArc(
		[]ArcEntry{{Score: 50}},
		[]ArcEntry{{Score: 55}},
		"February",
	)
	if result != nil {
		t.Error("expected nil with <7 entries")
	}
}

func TestBuildMonthlyArc_NilWhenDeltaInsignificant(t *testing.T) {
	makeEntries := func(score int) []ArcEntry {
		entries := make([]ArcEntry, 10)
		for i := range entries {
			entries[i] = ArcEntry{Score: score}
		}
		return entries
	}
	// delta = 3 (< 5 threshold)
	result := BuildMonthlyArc(makeEntries(50), makeEntries(53), "February")
	if result != nil {
		t.Error("expected nil for insignificant delta")
	}
}

func TestBuildMonthlyArc_ReturnsLighterMessage(t *testing.T) {
	makeEntries := func(score int) []ArcEntry {
		entries := make([]ArcEntry, 10)
		for i := range entries {
			entries[i] = ArcEntry{Score: score}
		}
		return entries
	}
	// This month lighter by 10 pts
	result := BuildMonthlyArc(makeEntries(45), makeEntries(55), "February")
	if result == nil {
		t.Fatal("expected a result")
	}
	if !containsAt(result.Message, "lighter") {
		t.Errorf("expected lighter message, got: %q", result.Message)
	}
}

func TestBuildMonthlyArc_ReturnsHeavierMessage(t *testing.T) {
	makeEntries := func(score int) []ArcEntry {
		entries := make([]ArcEntry, 10)
		for i := range entries {
			entries[i] = ArcEntry{Score: score}
		}
		return entries
	}
	result := BuildMonthlyArc(makeEntries(60), makeEntries(50), "February")
	if result == nil {
		t.Fatal("expected a result")
	}
	if !containsAt(result.Message, "heavier") {
		t.Errorf("expected heavier message, got: %q", result.Message)
	}
}

// ── FindWhatWorksForYou ───────────────────────────────────────────────────────

func TestFindWhatWorksForYou_NotEnoughData(t *testing.T) {
	result := FindWhatWorksForYou([]NoteEntry{
		{Score: 70, Note: "went for a walk", NextScore: intPtr(55)},
	})
	if result != "" {
		t.Errorf("expected empty with <5 entries, got %q", result)
	}
}

func TestFindWhatWorksForYou_DetectsWalkPattern(t *testing.T) {
	// 5 days where "walk" appears → next day consistently lower
	entries := []NoteEntry{
		{Score: 72, Note: "went for a walk at lunch", NextScore: intPtr(55)},
		{Score: 68, Note: "quick walk before dinner", NextScore: intPtr(50)},
		{Score: 75, Note: "took a long walk", NextScore: intPtr(58)},
		{Score: 65, Note: "walk in the park", NextScore: intPtr(48)},
		{Score: 70, Note: "morning walk", NextScore: intPtr(52)},
		// noise entries
		{Score: 50, Note: "regular day", NextScore: intPtr(51)},
		{Score: 55, Note: "busy day", NextScore: intPtr(56)},
	}
	result := FindWhatWorksForYou(entries)
	if !containsAt(result, "walk") {
		t.Errorf("expected walk mention, got: %q", result)
	}
	if !containsAt(result, "your data") {
		t.Errorf("expected 'your data' in result, got: %q", result)
	}
}

// ── BuildNotificationText ─────────────────────────────────────────────────────

func TestBuildNotificationText_DangerStreak(t *testing.T) {
	title, body := BuildNotificationText(NotificationInput{ConsecutiveDangerDays: 4})
	if !containsAt(title, "Check in") {
		t.Errorf("unexpected title: %q", title)
	}
	if !containsAt(body, "danger zone") {
		t.Errorf("unexpected body: %q", body)
	}
}

func TestBuildNotificationText_Streak7(t *testing.T) {
	title, _ := BuildNotificationText(NotificationInput{Streak: 7})
	if !containsAt(title, "7-day streak") {
		t.Errorf("expected streak title, got: %q", title)
	}
}

func TestBuildNotificationText_WithName(t *testing.T) {
	title, _ := BuildNotificationText(NotificationInput{Name: "Alex"})
	if !containsAt(title, "Alex") {
		t.Errorf("expected name in title, got: %q", title)
	}
}

// ── GetSessionContext ─────────────────────────────────────────────────────────

func TestGetSessionContext_NilYesterdayReturnsNil(t *testing.T) {
	result := GetSessionContext(SessionContextInput{
		YesterdayStress: nil,
		YesterdayScore:  nil,
		TodayScore:      70,
	})
	if result != nil {
		t.Error("expected nil when no yesterday data")
	}
}

func TestGetSessionContext_ScoreDrop(t *testing.T) {
	result := GetSessionContext(SessionContextInput{
		YesterdayStress: intPtr(4),
		YesterdayScore:  intPtr(72),
		TodayScore:      55, // dropped 17
	})
	if result == nil {
		t.Fatal("expected a result")
	}
	if result.Kind != "drop" {
		t.Errorf("expected drop, got %q", result.Kind)
	}
	if !containsAt(result.Message, "dropped") {
		t.Errorf("expected dropped message, got: %q", result.Message)
	}
}

func TestGetSessionContext_ScoreRise(t *testing.T) {
	result := GetSessionContext(SessionContextInput{
		YesterdayStress: intPtr(2),
		YesterdayScore:  intPtr(40),
		TodayScore:      55, // rose 15
	})
	if result == nil {
		t.Fatal("expected a result")
	}
	if result.Kind != "rise" {
		t.Errorf("expected rise, got %q", result.Kind)
	}
}

func TestGetSessionContext_DeadlineNoteReference(t *testing.T) {
	result := GetSessionContext(SessionContextInput{
		YesterdayStress: intPtr(4),
		YesterdayScore:  intPtr(70),
		YesterdayNote:   "big deadline tomorrow",
		TodayScore:      68, // small delta — note takes priority
	})
	if result == nil {
		t.Fatal("expected a result")
	}
	if result.Kind != "note_reference" {
		t.Errorf("expected note_reference, got %q", result.Kind)
	}
}

func TestGetSessionContext_SmallDeltaReturnsNil(t *testing.T) {
	result := GetSessionContext(SessionContextInput{
		YesterdayStress: intPtr(3),
		YesterdayScore:  intPtr(55),
		TodayScore:      58, // delta = +3, below threshold
	})
	if result != nil {
		t.Errorf("expected nil for small delta, got %+v", result)
	}
}

// ── ComputePersonalSignature ──────────────────────────────────────────────────

func TestComputePersonalSignature_RequiresMinEntries(t *testing.T) {
	entries := make([]SignatureEntry, 13)
	result := ComputePersonalSignature(entries)
	if result != nil {
		t.Error("expected nil with <14 entries")
	}
}

func TestComputePersonalSignature_ImprovingTrend(t *testing.T) {
	entries := make([]SignatureEntry, 20)
	// First half: high stress, second half: low stress
	for i := range entries {
		stress := 4
		score := 70
		if i >= 10 {
			stress = 2
			score = 35
		}
		entries[i] = SignatureEntry{
			Date:   mustDate("2025-01-01").AddDate(0, 0, i),
			Stress: stress,
			Score:  score,
			Note:   "",
		}
	}
	result := ComputePersonalSignature(entries)
	if result == nil {
		t.Fatal("expected a result")
	}
	if result.Trend != TrendImproving {
		t.Errorf("expected improving, got %s", result.Trend)
	}
}

func TestComputePersonalSignature_WorseningTrend(t *testing.T) {
	entries := make([]SignatureEntry, 20)
	for i := range entries {
		stress := 2
		score := 35
		if i >= 10 {
			stress = 4
			score = 70
		}
		entries[i] = SignatureEntry{
			Date:   mustDate("2025-01-01").AddDate(0, 0, i),
			Stress: stress,
			Score:  score,
		}
	}
	result := ComputePersonalSignature(entries)
	if result == nil {
		t.Fatal("expected a result")
	}
	if result.Trend != TrendWorsening {
		t.Errorf("expected worsening, got %s", result.Trend)
	}
}

// ── BuildSignatureNarrative ───────────────────────────────────────────────────

func TestBuildSignatureNarrative_EmptyFallback(t *testing.T) {
	sig := SignatureData{Trend: TrendStable}
	result := BuildSignatureNarrative(sig)
	if !containsAt(result, "Keep checking in") {
		t.Errorf("expected fallback message, got: %q", result)
	}
}

func TestBuildSignatureNarrative_DeadlineTrigger(t *testing.T) {
	trigger := "deadline"
	lift := 1.2
	sig := SignatureData{
		TopTrigger:  &trigger,
		TriggerLift: lift,
		Trend:       TrendStable,
	}
	result := BuildSignatureNarrative(sig)
	if !containsAt(result, "Deadlines") {
		t.Errorf("expected deadline narrative, got: %q", result)
	}
}

// ── roundInt / clamp ──────────────────────────────────────────────────────────

func TestRoundInt(t *testing.T) {
	cases := []struct{ f float64; want int }{
		{2.4, 2},
		{2.5, 3},
		{-2.5, -3},
		{0, 0},
	}
	for _, c := range cases {
		if got := roundInt(c.f); got != c.want {
			t.Errorf("roundInt(%.1f) = %d, want %d", c.f, got, c.want)
		}
	}
}

func TestClamp(t *testing.T) {
	if clamp(5, 8, 92) != 8 {
		t.Error("expected 8")
	}
	if clamp(100, 8, 92) != 92 {
		t.Error("expected 92")
	}
	if clamp(50, 8, 92) != 50 {
		t.Error("expected 50")
	}
}

// ── meetingMod ────────────────────────────────────────────────────────────────

func TestMeetingMod(t *testing.T) {
	cases := []struct{ count, want int }{
		{-1, 0},
		{0, 0},
		{1, 2},
		{2, 2},
		{3, 5},
		{4, 5},
		{5, 9},
		{6, 9},
		{7, 12},
		{10, 12},
	}
	for _, c := range cases {
		if got := meetingMod(c.count); got != c.want {
			t.Errorf("meetingMod(%d) = %d, want %d", c.count, got, c.want)
		}
	}
}