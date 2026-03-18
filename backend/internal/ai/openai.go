// Package ai wraps the OpenAI Chat Completions API for recovery plan generation.
package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/nyasha-hama/burnout-predictor-api/internal/score"
)

const (
	apiURL = "https://api.openai.com/v1/chat/completions"
	model  = "gpt-4o-mini"
)

// Client calls the OpenAI API.
type Client struct {
	apiKey string
	http   *http.Client
}

// New creates an OpenAI client.
func New(apiKey string) *Client {
	return &Client{
		apiKey: apiKey,
		http:   &http.Client{Timeout: 20 * time.Second},
	}
}

// GenerateRecoveryPlan calls GPT-4o-mini to produce a personalised 3-section
// recovery plan (Tonight / Tomorrow / This week) from a high-stress check-in.
//
// Returns nil, err on any failure so callers can fall back to
// score.BuildDynamicRecoveryPlan without changing behaviour for the user.
func (c *Client) GenerateRecoveryPlan(ctx context.Context, stress int, note, role string) ([]score.PlanSection, error) {
	const system = `You are a burnout and cognitive load specialist advising software professionals.
Generate a personalised recovery plan as a JSON object with a single key "sections" whose value is an array of exactly 3 objects.
Each object must have "timing" (one of: "Tonight", "Tomorrow", "This week") and "actions" (an array of 2–3 concise, specific, actionable strings — no filler).
Be direct. No reassurance, no preamble. Output ONLY valid JSON.`

	user := fmt.Sprintf(`Stress: %d/5. Role: %s. Their note: %q`, stress, role, note)

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
		Messages:    []message{{Role: "system", Content: system}, {Role: "user", Content: user}},
		MaxTokens:   512,
		Temperature: 0.4,
	}
	req.ResponseFormat.Type = "json_object"

	body, _ := json.Marshal(req)
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, apiURL, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Authorization", "Bearer "+c.apiKey)
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("openai: %d — %s", resp.StatusCode, string(raw))
	}

	var chatResp struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(raw, &chatResp); err != nil || len(chatResp.Choices) == 0 {
		return nil, fmt.Errorf("openai: parse response: %w", err)
	}

	// The model returns {"sections": [...]}
	var envelope struct {
		Sections []score.PlanSection `json:"sections"`
	}
	if err := json.Unmarshal([]byte(chatResp.Choices[0].Message.Content), &envelope); err != nil {
		return nil, fmt.Errorf("openai: parse plan JSON: %w", err)
	}
	if len(envelope.Sections) != 3 {
		return nil, fmt.Errorf("openai: expected 3 sections, got %d", len(envelope.Sections))
	}
	return envelope.Sections, nil
}
