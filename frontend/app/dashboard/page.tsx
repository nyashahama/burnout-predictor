"use client";

import { Activity, RefreshCcw, TrendingDown, TrendingUp } from "lucide-react";
import CheckIn from "@/components/dashboard/CheckIn";
import { useDashboardData } from "@/contexts/DashboardDataContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateForDisplay, getTodayString } from "@/lib/date";

function getLevel(score: number) {
  if (score > 65) return { label: "High strain", tone: "destructive" as const };
  if (score > 40) return { label: "Watch this", tone: "secondary" as const };
  return { label: "In your zone", tone: "default" as const };
}

export default function DashboardPage() {
  const { scoreCard, checkins, insightBundle, loadingData, loadingMessage, loadError, reload, handleCheckInComplete } = useDashboardData();

  if (loadingData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Preparing your dashboard</CardTitle>
          <CardDescription>
            {loadingMessage} Render cold starts and DeepSeek-backed responses can take a bit longer on the free tier.
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
            This usually means the free Render instance or a slower AI-backed score call did not finish in time.
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

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-4xl tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Your current score, recent trend, and today&apos;s recovery context in one place.
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
                  <div className="text-sm text-muted-foreground">Streak</div>
                  <div className="mt-2 text-2xl font-semibold">{streak}</div>
                </div>
                <div className="rounded-lg border border-border p-4">
                  <div className="text-sm text-muted-foreground">Danger days</div>
                  <div className="mt-2 text-2xl font-semibold">{dangerDays}</div>
                </div>
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

        <CheckIn checkins={checkins} streakFromApi={streak} onComplete={handleCheckInComplete} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
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
            <CardTitle>Insights</CardTitle>
            <CardDescription>What the backend has learned so far.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {insightBundle?.patterns?.length ? (
              insightBundle.patterns.map((pattern, index) => (
                <div key={index} className="rounded-lg border border-border px-4 py-3 text-sm leading-6">
                  {pattern}
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                Check in consistently for a few days and the dashboard will start surfacing pattern-based insights.
              </p>
            )}
            {scoreCard?.suggestion && (
              <div className="rounded-lg border border-primary/15 bg-primary/5 px-4 py-3 text-sm leading-6">
                <span className="font-medium text-primary">Today&apos;s move:</span> {scoreCard.suggestion}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
