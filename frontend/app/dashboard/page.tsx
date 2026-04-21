"use client";

import { Activity, RefreshCcw, TrendingDown, TrendingUp } from "lucide-react";
import CheckIn from "@/components/dashboard/CheckIn";
import TodayBriefing from "@/components/dashboard/TodayBriefing";
import StreakDots from "@/components/dashboard/StreakDots";
import StreakMilestoneCard from "@/components/dashboard/StreakMilestoneCard";
import ConsistencyMetric from "@/components/dashboard/ConsistencyMetric";
import InsightRevealCard from "@/components/dashboard/InsightRevealCard";
import PersonalizationProgress from "@/components/dashboard/PersonalizationProgress";
import PlaybookPanel from "@/components/dashboard/PlaybookPanel";
import { useDashboardData } from "@/contexts/DashboardDataContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateForDisplay, getTodayString } from "@/lib/date";
import { buildDynamicRecoveryPlan } from "@/app/dashboard/data";

function getLevel(score: number) {
  if (score > 65) return { label: "High strain", tone: "destructive" as const };
  if (score > 40) return { label: "Watch this", tone: "secondary" as const };
  return { label: "In your zone", tone: "default" as const };
}

function forecastCopy(delta: number) {
  if (delta >= 3) return `+${delta} vs today`;
  if (delta <= -3) return `${delta} vs today`;
  return "roughly flat";
}

export default function DashboardPage() {
  const {
    scoreCard,
    checkins,
    insightBundle,
    loadingData,
    loadError,
    reload,
    handleCheckInComplete,
    followUp,
    dismissFollowUp,
    commitRecommendation,
    completeCommitment,
    skipCommitment,
  } = useDashboardData();

  if (loadingData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Loading your dashboard</CardTitle>
          <CardDescription>
            Please wait while we fetch your data.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <div className="grid gap-4 lg:grid-cols-2">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (loadError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Dashboard unavailable</CardTitle>
          <CardDescription>{loadError}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Please try again.
          </p>
          <Button onClick={() => void reload()}>
            <RefreshCcw className="h-4 w-4" />
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  const liveScore = scoreCard?.score.score ?? 0;
  const streak = scoreCard?.streak ?? 0;
  const level = getLevel(liveScore);
  const recent = checkins.slice(0, 7).reverse();
  const dangerDays = checkins.filter((entry) => entry.score > 65).length;
  const todayCheckIn = checkins.find((entry) => entry.checked_in_date === getTodayString());
  const forecast = scoreCard?.daily_forecast;

  const consistencyPct = scoreCard?.consistency_pct ?? 0;
  const streakMilestones = insightBundle?.streak_milestones ?? [];
  const whatWorkedToday = insightBundle?.what_worked_today ?? null;
  const patternInsights = insightBundle?.pattern_insights ?? [];
  const whatWorks = insightBundle?.what_works ?? "";

  const briefingReason =
    patternInsights[0]?.explanation ??
    whatWorks ??
    scoreCard?.explanation ??
    "Check in today to start turning repeated patterns into personal guidance.";

  const briefingConfidence = scoreCard?.accuracy_label
    ? `${scoreCard.accuracy_label}. More check-ins make this recommendation more personal.`
    : "Generic for now. Add a few more check-ins and notes so Overload can separate real patterns from noise.";

  const briefingNewLearning =
    whatWorkedToday?.evidence ??
    patternInsights[0]?.evidence ??
    "No new patterns confirmed yet. Keep checking in and Overload will turn repeated signals into something personal.";

  const trend = recent.length >= 2 ? recent[recent.length - 1].score - recent[0].score : 0;

  let dangerStreak = 0;
  for (const entry of checkins) {
    if (entry.score > 65) dangerStreak++;
    else break;
  }

  const plan = todayCheckIn && todayCheckIn.stress >= 4
    ? buildDynamicRecoveryPlan({
        note: todayCheckIn?.note ?? undefined,
        stress: todayCheckIn.stress,
        consecutiveDays: dangerDays,
        role: "engineer",
      })
    : [];

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-4xl tracking-tight">How are you?</h1>
        <p className="text-muted-foreground">
          Check in, get your action plan, and track what works.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle className="text-2xl">Current strain</CardTitle>
              <CardDescription>Updated from your latest check-in and profile context.</CardDescription>
            </div>
            <Badge variant={level.tone === "destructive" ? "destructive" : "secondary"}>{level.label}</Badge>
          </CardHeader>
          <CardContent className="grid gap-6 md:grid-cols-[220px_1fr] md:items-center">
            <div className="rounded-2xl border border-primary/10 bg-primary/5 p-6 text-center">
              <div className="text-6xl font-semibold text-primary">{liveScore}</div>
              <div className="mt-2 text-sm uppercase tracking-[0.2em] text-muted-foreground">out of 100</div>
            </div>
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-lg border border-border p-4">
                  <StreakDots streak={streak} checkins={checkins} />
                </div>
                <ConsistencyMetric consistencyPct={consistencyPct} />
                <div className="rounded-lg border border-border p-4">
                  <div className="text-sm text-muted-foreground">Today</div>
                  <div className="mt-2 text-2xl font-semibold">{todayCheckIn ? todayCheckIn.stress : "—"}</div>
                </div>
              </div>
              <p className="text-sm leading-7 text-muted-foreground">
                {scoreCard?.explanation ?? "Check in today to sharpen the score and recovery recommendations."}
              </p>
              {scoreCard?.trajectory && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  {scoreCard.trajectory.includes("down") ? <TrendingDown className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
                  {scoreCard.trajectory}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <CheckIn checkins={checkins} followUp={followUp} onComplete={handleCheckInComplete} onDismissFollowUp={dismissFollowUp} />
      </div>

<StreakMilestoneCard milestones={streakMilestones} />

      {scoreCard && (
        <>
          <TodayBriefing
            scoreCard={scoreCard}
            todayCheckIn={todayCheckIn}
            plan={plan}
            trend={trend}
            dangerStreak={dangerStreak}
            dangerDaysAhead={0}
            recoveryDate=""
            reason={briefingReason}
            confidenceCopy={briefingConfidence}
            newLearning={briefingNewLearning}
            whatWorkedToday={whatWorkedToday}
            feedbackSubmittedForToday={scoreCard.feedback_submitted_for_today}
            briefingRecommendation={insightBundle?.briefing_recommendation ?? null}
            activeCommitment={insightBundle?.active_commitment ?? null}
            onCommitRecommendation={commitRecommendation}
            onCompleteCommitment={completeCommitment}
            onSkipCommitment={skipCommitment}
          />

          <PersonalizationProgress
            progress={insightBundle?.personalization_progress ?? null}
            accuracyLabel={scoreCard?.accuracy_label ?? "Still learning"}
          />

          <PlaybookPanel
            title="Your Playbook"
            subtitle="The durable memory behind today's recommendation."
            playbook={insightBundle?.playbook ?? null}
            compact
          />
        </>
      )}

      <InsightRevealCard
        patternInsights={patternInsights}
        whatWorks={whatWorks}
        checkInCount={insightBundle?.check_in_count ?? 0}
      />

      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Tomorrow forecast</CardTitle>
            <CardDescription>
              {forecast?.summary ?? "Log today to unlock a clearer tomorrow forecast."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-end justify-between gap-4">
              <div>
                <div className="text-sm text-muted-foreground">Projected score</div>
                <div className="text-4xl font-semibold">{forecast?.score ?? "—"}</div>
              </div>
              <Badge variant={forecast?.direction === "up" ? "destructive" : "secondary"}>
                {forecast ? forecastCopy(forecast.delta) : "pending"}
              </Badge>
            </div>
            <div className="text-sm text-muted-foreground">
              Confidence: <span className="font-medium capitalize text-foreground">{forecast?.confidence ?? "low"}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              Last 7 check-ins
            </CardTitle>
            <CardDescription>Latest entries, oldest to newest.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">No check-ins yet. Your first one will appear here.</p>
            ) : (
              recent.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                  <div>
                    <div className="font-medium">{formatDateForDisplay(entry.checked_in_date)}</div>
                    <div className="text-sm text-muted-foreground">{entry.note || "No note captured"}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-semibold">{entry.score}</div>
                    <div className="text-xs uppercase tracking-[0.15em] text-muted-foreground">stress {entry.stress}</div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Calibration</CardTitle>
            <CardDescription>How much real signal the system has collected from you.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-3xl font-semibold">{scoreCard?.accuracy_label || "Still learning"}</div>
            <p className="text-sm leading-7 text-muted-foreground">
              More real check-ins increase the reliability of forecasts, pattern detection, and recovery feedback.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}