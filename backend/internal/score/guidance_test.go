package score

import "testing"

func floatPtr(v float64) *float64 { return &v }

func TestBuildDailyForecast_UpwardPressure(t *testing.T) {
	entries := []AnalysisEntry{
		{
			Date:             mustDate("2026-03-31"),
			Stress:           5,
			Score:            76,
			Note:             "deadline and meetings all day",
			EnergyLevel:      intPtr(2),
			FocusQuality:     intPtr(2),
			HoursWorked:      floatPtr(10),
			PhysicalSymptoms: []string{"fatigue"},
		},
		{Date: mustDate("2026-03-30"), Stress: 4, Score: 70},
		{Date: mustDate("2026-03-29"), Stress: 4, Score: 68},
	}

	forecast := BuildDailyForecast(76, 2, entries)
	if forecast.Direction != ForecastUp {
		t.Fatalf("Direction = %s, want up", forecast.Direction)
	}
	if forecast.Score <= 76 {
		t.Fatalf("Score = %d, want > 76", forecast.Score)
	}
	if forecast.Confidence != ConfidenceMedium {
		t.Fatalf("Confidence = %s, want medium", forecast.Confidence)
	}
}

func TestBuildPatternInsights_LongHoursPattern(t *testing.T) {
	entries := []AnalysisEntry{
		{Date: mustDate("2026-03-01"), Score: 74, HoursWorked: floatPtr(10)},
		{Date: mustDate("2026-03-02"), Score: 72, HoursWorked: floatPtr(9.5)},
		{Date: mustDate("2026-03-03"), Score: 70, HoursWorked: floatPtr(9)},
		{Date: mustDate("2026-03-04"), Score: 55, HoursWorked: floatPtr(8)},
		{Date: mustDate("2026-03-05"), Score: 52, HoursWorked: floatPtr(7.5)},
		{Date: mustDate("2026-03-06"), Score: 54, HoursWorked: floatPtr(8)},
		{Date: mustDate("2026-03-07"), Score: 51, HoursWorked: floatPtr(7)},
	}

	patterns := BuildPatternInsights(entries)
	if len(patterns) == 0 {
		t.Fatal("expected at least one pattern insight")
	}
	found := false
	for _, pattern := range patterns {
		if pattern.Driver == "hours_worked" {
			found = true
		}
	}
	if !found {
		t.Fatal("expected hours_worked pattern insight")
	}
}

func TestBuildRecoveryFeedback_FindsHelpfulSignals(t *testing.T) {
	entries := []AnalysisEntry{
		{Date: mustDate("2026-03-01"), Score: 70, HoursWorked: floatPtr(7.5), EnergyLevel: intPtr(4)},
		{Date: mustDate("2026-03-02"), Score: 61},
		{Date: mustDate("2026-03-03"), Score: 68, HoursWorked: floatPtr(7.0), EnergyLevel: intPtr(5)},
		{Date: mustDate("2026-03-04"), Score: 58},
		{Date: mustDate("2026-03-05"), Score: 66, HoursWorked: floatPtr(8.0), EnergyLevel: intPtr(4)},
		{Date: mustDate("2026-03-06"), Score: 57},
	}

	feedback := BuildRecoveryFeedback(entries)
	if len(feedback) == 0 {
		t.Fatal("expected recovery feedback")
	}
	if feedback[0].AverageImprovement < 3 {
		t.Fatalf("AverageImprovement = %d, want >= 3", feedback[0].AverageImprovement)
	}
}
