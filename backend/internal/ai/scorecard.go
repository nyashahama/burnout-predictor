package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"strings"

	db "github.com/nyasha-hama/burnout-predictor-api/internal/db/sqlc"
	"github.com/nyasha-hama/burnout-predictor-api/internal/score"
)

// ScoreCardNarrative is the AI-generated narrative layer returned for a score card.
type ScoreCardNarrative struct {
	Explanation  string              `json:"explanation"`
	Signals      []score.Signal      `json:"signals"`
	Suggestion   string              `json:"suggestion"`
	RecoveryPlan []score.PlanSection `json:"recovery_plan"`
}

// ScoreCardInput is everything the AI needs to generate a personalised score card.
type ScoreCardInput struct {
	Role          string
	SleepBaseline int
	CheckInCount  int64
	TodayStress   int
	TodayEnergy   *int
	TodayFocus    *int
	TodayHours    *float64
	TodaySymptoms []string
	TodayNote     string
	TodayScore    int
}

// GenerateScoreCard calls GPT-4o-mini to produce a personalised score card narrative.
// Returns an error on any failure — callers must fall back to rule-based functions.
func (c *Client) GenerateScoreCard(ctx context.Context, in ScoreCardInput, history []db.ListRecentCheckInsRow) (ScoreCardNarrative, error) {
	compressed := CompressHistory(history)

	var historySection string
	if compressed == "" {
		historySection = "No history yet — this user is new. Generate a score card based only on today's signals and their profile."
	} else {
		historySection = "30-day history (newest first):\n" + compressed
	}

	todayParts := []string{
		fmt.Sprintf("stress=%d", in.TodayStress),
		fmt.Sprintf("score=%d", in.TodayScore),
	}
	if in.TodayEnergy != nil {
		todayParts = append(todayParts, fmt.Sprintf("energy=%d", *in.TodayEnergy))
	}
	if in.TodayFocus != nil {
		todayParts = append(todayParts, fmt.Sprintf("focus=%d", *in.TodayFocus))
	}
	if in.TodayHours != nil {
		todayParts = append(todayParts, fmt.Sprintf("hours=%.1f", *in.TodayHours))
	}
	if len(in.TodaySymptoms) > 0 {
		todayParts = append(todayParts, fmt.Sprintf("symptoms=[%s]", strings.Join(in.TodaySymptoms, ",")))
	}
	if in.TodayNote != "" {
		snippet := in.TodayNote
		if len([]rune(snippet)) > 60 {
			snippet = string([]rune(snippet)[:60]) + "..."
		}
		todayParts = append(todayParts, fmt.Sprintf("note=%q", snippet))
	}
	todayLine := strings.Join(todayParts, " ")

	const system = `You are a burnout and cognitive load coach with deep knowledge of this specific user's history.
Generate a personalised score card as a JSON object with exactly these keys:
- "explanation": 1-2 sentences that reference actual patterns or events from their history. Be specific — mention days, scores, or keywords from their notes where relevant.
- "signals": array of 3-4 objects, each with "label" (short noun phrase), "val" (short value string), "detail" (1 sentence specific to this user), "level" ("ok", "warning", or "danger").
- "suggestion": one concrete, actionable directive for today. Specific to their situation, not generic advice.
- "recovery_plan": array of exactly 3 objects with "timing" (one of "Tonight", "Tomorrow", "This week") and "actions" (2-3 specific strings). Only include if stress >= 4, otherwise return an empty array [].
Be direct. No preamble, no reassurance. Output ONLY valid JSON.`

	userMsg := fmt.Sprintf(
		"User profile: role=%s sleep_baseline=%dh check_ins=%d\n\nToday: %s\n\n%s",
		in.Role, in.SleepBaseline, in.CheckInCount, todayLine, historySection,
	)

	type message struct {
		Role    string `json:"role"`
		Content string `json:"content"`
	}
	type reqBody struct {
		Model          string    `json:"model"`
		Messages       []message `json:"messages"`
		ResponseFormat struct {
			Type string `json:"type"`
		} `json:"response_format"`
		MaxTokens   int     `json:"max_tokens"`
		Temperature float64 `json:"temperature"`
	}

	req := reqBody{
		Model:       model,
		Messages:    []message{{Role: "system", Content: system}, {Role: "user", Content: userMsg}},
		MaxTokens:   600,
		Temperature: 0.4,
	}
	req.ResponseFormat.Type = "json_object"

	body, err := json.Marshal(req)
	if err != nil {
		return ScoreCardNarrative{}, fmt.Errorf("marshal request: %w", err)
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, apiURL, bytes.NewReader(body))
	if err != nil {
		return ScoreCardNarrative{}, err
	}
	httpReq.Header.Set("Authorization", "Bearer "+c.apiKey)
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(httpReq)
	if err != nil {
		return ScoreCardNarrative{}, err
	}
	defer resp.Body.Close() //nolint:errcheck // unactionable after body is read

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return ScoreCardNarrative{}, fmt.Errorf("openai: read response body: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		return ScoreCardNarrative{}, fmt.Errorf("openai: %d — %s", resp.StatusCode, string(raw))
	}

	var chatResp struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(raw, &chatResp); err != nil {
		return ScoreCardNarrative{}, fmt.Errorf("openai: parse response: %w", err)
	}
	if len(chatResp.Choices) == 0 {
		return ScoreCardNarrative{}, fmt.Errorf("openai: empty choices in response")
	}

	var narrative ScoreCardNarrative
	if err := json.Unmarshal([]byte(chatResp.Choices[0].Message.Content), &narrative); err != nil {
		return ScoreCardNarrative{}, fmt.Errorf("openai: parse score card JSON: %w", err)
	}
	if narrative.Explanation == "" || len(narrative.Signals) == 0 || narrative.Suggestion == "" {
		return ScoreCardNarrative{}, fmt.Errorf("openai: incomplete score card response")
	}
	return narrative, nil
}

// CompressHistory converts check-in rows into a token-efficient string for the AI prompt.
// Returns empty string when len(rows) < 3 (cold-start — caller tells the model no history exists).
func CompressHistory(rows []db.ListRecentCheckInsRow) string {
	if len(rows) < 3 {
		return ""
	}

	var lines []string
	var totalStress, totalScore float64

	for _, r := range rows {
		date := r.CheckedInDate.Time.Format("2006-01-02")
		parts := []string{
			date,
			fmt.Sprintf("s=%d", r.Stress),
			fmt.Sprintf("score=%d", r.Score),
		}

		if r.EnergyLevel.Valid {
			parts = append(parts, fmt.Sprintf("e=%d", r.EnergyLevel.Int16))
		}
		if r.FocusQuality.Valid {
			parts = append(parts, fmt.Sprintf("f=%d", r.FocusQuality.Int16))
		}
		if r.HoursWorked.Valid {
			f, err := r.HoursWorked.Float64Value()
			if err == nil && f.Valid {
				parts = append(parts, fmt.Sprintf("h=%.1f", f.Float64))
			}
		}
		if len(r.PhysicalSymptoms) > 0 {
			parts = append(parts, fmt.Sprintf("symptoms=[%s]", strings.Join(r.PhysicalSymptoms, ",")))
		}

		if r.Note.Valid && r.Note.String != "" {
			snippet := r.Note.String
			if len([]rune(snippet)) > 60 {
				snippet = string([]rune(snippet)[:60]) + "..."
			}
			parts = append(parts, fmt.Sprintf("note=%q", snippet))
		}

		lines = append(lines, strings.Join(parts, " "))
		totalStress += float64(r.Stress)
		totalScore += float64(r.Score)
	}

	n := float64(len(rows))
	avgStress := math.Round(totalStress/n*10) / 10
	avgScore := math.Round(totalScore / n)

	header := fmt.Sprintf("stats: avg_stress=%.1f avg_score=%.0f entries=%d", avgStress, avgScore, len(rows))
	return header + "\n" + strings.Join(lines, "\n")
}
