// Package worker manages background task scheduling.
package worker

import (
	"context"
	"log/slog"
	"runtime/debug"
	"time"

	notificationsvc "github.com/nyasha-hama/burnout-predictor-api/internal/service/notification"
)

// Run starts the background worker loops and blocks until ctx is cancelled.
func Run(ctx context.Context, log *slog.Logger, notif *notificationsvc.Service) {
	minuteTicker := time.NewTicker(60 * time.Second)
	aiTicker := time.NewTicker(5 * time.Minute)
	hourlyTicker := time.NewTicker(time.Hour)
	defer minuteTicker.Stop()
	defer aiTicker.Stop()
	defer hourlyTicker.Stop()

	for {
		select {
		case <-minuteTicker.C:
			runTask(log, "minutely", func() { notif.RunMinutely(context.WithoutCancel(ctx)) })
		case <-aiTicker.C:
			runTask(log, "ai-backfill", func() { notif.BackfillAIPlans(context.WithoutCancel(ctx)) })
		case <-hourlyTicker.C:
			runTask(log, "maintenance", func() { notif.RunMaintenance(context.WithoutCancel(ctx)) })
		case <-ctx.Done():
			return
		}
	}
}

// runTask executes fn with panic recovery and start/end/duration logging.
// A panic does not kill the worker loop — it is logged and the loop continues.
func runTask(log *slog.Logger, name string, fn func()) {
	defer func() {
		if r := recover(); r != nil {
			log.Error("worker: task panicked", "task", name, "panic", r, "stack", string(debug.Stack()))
		}
	}()
	start := time.Now()
	log.Info("worker: task start", "task", name)
	fn()
	log.Info("worker: task done", "task", name, "duration_ms", time.Since(start).Milliseconds())
}
