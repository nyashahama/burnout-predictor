package score

import (
	"strings"
)

func FindSmallWinsImpact(entries []NoteEntry, smallWins string) int {
	if len(entries) < 5 || smallWins == "" {
		return 0
	}

	keywords := strings.Fields(strings.ToLower(smallWins))
	var totalImprovement int
	var matchCount int

	for i := 0; i < len(entries)-1; i++ {
		if entries[i].Note == "" || entries[i+1].NextScore == nil {
			continue
		}
		note := strings.ToLower(entries[i].Note)
		for _, kw := range keywords {
			if strings.Contains(note, kw) {
				delta := entries[i].Score - *entries[i+1].NextScore
				if delta > 0 {
					totalImprovement += delta
					matchCount++
				}
				break
			}
		}
	}

	if matchCount < 2 {
		return 0
	}
	avg := float64(totalImprovement) / float64(matchCount)
	if avg < 3 {
		return 0
	}
	return int(avg)
}
