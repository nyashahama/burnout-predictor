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
			notif.RunMinutely(context.WithoutCancel(ctx))
		case <-aiTicker.C:
			notif.BackfillAIPlans(context.WithoutCancel(ctx))
		case <-hourlyTicker.C:
			notif.RunMaintenance(context.WithoutCancel(ctx))
		case <-ctx.Done():
			return
		}
	}
}
