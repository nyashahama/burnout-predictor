// Package email sends transactional email via the Resend API.
package email

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

const apiURL = "https://api.resend.com/emails"

// Client is a thin wrapper around the Resend REST API.
type Client struct {
	apiKey string
	from   string
	http   *http.Client
}

// New creates a Resend email client.
// from must be a verified sender address, e.g. "Overload <hello@overload.app>".
func New(apiKey, from string) *Client {
	return &Client{
		apiKey: apiKey,
		from:   from,
		http:   &http.Client{Timeout: 10 * time.Second},
	}
}

// Params defines the payload for a single outbound email.
type Params struct {
	To      string
	Subject string
	HTML    string
}

// Send delivers one email and returns the Resend message ID.
func (c *Client) Send(ctx context.Context, p Params) (msgID string, err error) {
	payload, _ := json.Marshal(map[string]interface{}{
		"from":    c.from,
		"to":      []string{p.To},
		"subject": p.Subject,
		"html":    p.HTML,
	})

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, apiURL, bytes.NewReader(payload))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("resend: read body: %w", err)
	}
	if resp.StatusCode >= 300 {
		return "", fmt.Errorf("resend: %d — %s", resp.StatusCode, string(raw))
	}

	var result struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return "", fmt.Errorf("resend: parse response: %w", err)
	}
	return result.ID, nil
}
