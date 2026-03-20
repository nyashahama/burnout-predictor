// Package worker manages background task scheduling.
package worker

import (
	"context"
	"time"

	notificationsvc "github.com/nyasha-hama/burnout-predictor-api/internal/service/notification"
)

// Run starts the background worker loops and blocks until ctx is cancelled.
func Run(ctx context.Context, notif *notificationsvc.Service) {
	minuteTicker := time.NewTicker(60 * time.Second)
	aiTicker := time.NewTicker(5 * time.Minute)
	hourlyTicker := time.NewTicker(time.Hour)
	defer minuteTicker.Stop()
	defer aiTicker.Stop()
	defer hourlyTicker.Stop()

	for {
		select {
		case <-minuteTicker.C:
			notif.RunMinutely(ctx)
		case <-aiTicker.C:
			notif.BackfillAIPlans(ctx)
		case <-hourlyTicker.C:
			notif.RunMaintenance(ctx)
		case <-ctx.Done():
			return
		}
	}
}
