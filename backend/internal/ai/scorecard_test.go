package ai

import (
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	db "github.com/nyasha-hama/burnout-predictor-api/internal/db/sqlc"
)

func makeDate(daysAgo int) pgtype.Date {
	t := time.Now().AddDate(0, 0, -daysAgo)
	return pgtype.Date{Time: t, Valid: true}
}

func makeNote(s string) pgtype.Text {
	return pgtype.Text{String: s, Valid: true}
}

func TestCompressHistory_empty(t *testing.T) {
	result := CompressHistory(nil)
	if result != "" {
		t.Errorf("expected empty string for nil input, got %q", result)
	}
}

func TestCompressHistory_fewerThanThree_returnsEmpty(t *testing.T) {
	rows := []db.ListRecentCheckInsRow{
		{CheckedInDate: makeDate(1), Stress: 3, Score: 50, Note: makeNote("felt fine")},
		{CheckedInDate: makeDate(2), Stress: 4, Score: 64, Note: makeNote("deadline")},
	}
	result := CompressHistory(rows)
	if result != "" {
		t.Errorf("expected empty string for < 3 rows (cold-start), got: %s", result)
	}
}

func TestCompressHistory_threeOrMore_returnsData(t *testing.T) {
	rows := []db.ListRecentCheckInsRow{
		{CheckedInDate: makeDate(1), Stress: 3, Score: 50, Note: makeNote("felt fine")},
		{CheckedInDate: makeDate(2), Stress: 4, Score: 64, Note: makeNote("deadline pressure")},
		{CheckedInDate: makeDate(3), Stress: 2, Score: 35, Note: makeNote("good day")},
	}
	result := CompressHistory(rows)
	if result == "" {
		t.Fatal("expected non-empty result for 3 rows")
	}
	if !strings.Contains(result, "s=3") {
		t.Errorf("expected stress value in output, got: %s", result)
	}
	if !strings.Contains(result, "avg_stress=") {
		t.Errorf("expected stats header with avg_stress, got: %s", result)
	}
}

func TestCompressHistory_noteTruncation(t *testing.T) {
	longNote := strings.Repeat("x", 100)
	rows := []db.ListRecentCheckInsRow{
		{CheckedInDate: makeDate(1), Stress: 3, Score: 50, Note: makeNote(longNote)},
		{CheckedInDate: makeDate(2), Stress: 3, Score: 50, Note: makeNote("short")},
		{CheckedInDate: makeDate(3), Stress: 3, Score: 50},
	}
	result := CompressHistory(rows)
	lines := strings.Split(result, "\n")
	for _, line := range lines {
		if strings.Contains(line, "note=") {
			noteStart := strings.Index(line, "note=")
			noteVal := line[noteStart:]
			if len(noteVal) > 75 {
				t.Errorf("note snippet too long in output line: %s", noteVal)
			}
		}
	}
}

func TestCompressHistory_symptomsIncluded(t *testing.T) {
	rows := []db.ListRecentCheckInsRow{
		{CheckedInDate: makeDate(1), Stress: 4, Score: 68, PhysicalSymptoms: []string{"fatigue", "headache"}},
		{CheckedInDate: makeDate(2), Stress: 3, Score: 55},
		{CheckedInDate: makeDate(3), Stress: 3, Score: 50},
	}
	result := CompressHistory(rows)
	if !strings.Contains(result, "symptoms=[fatigue,headache]") {
		t.Errorf("expected symptoms in output, got: %s", result)
	}
}

func TestCompressHistory_statsHeader(t *testing.T) {
	rows := make([]db.ListRecentCheckInsRow, 7)
	for i := range rows {
		rows[i] = db.ListRecentCheckInsRow{
			CheckedInDate: makeDate(i + 1),
			Stress:        int16(3 + i%2),
			Score:         int16(50 + i*2),
		}
	}
	result := CompressHistory(rows)
	if !strings.Contains(result, "avg_stress=") {
		t.Errorf("expected avg_stress in stats header, got: %s", result)
	}
	if !strings.Contains(result, "avg_score=") {
		t.Errorf("expected avg_score in stats header, got: %s", result)
	}
	if !strings.Contains(result, "entries=7") {
		t.Errorf("expected entries=7 in stats header, got: %s", result)
	}
}
