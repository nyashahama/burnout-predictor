"use client";

import ActionPlan from "@/components/dashboard/ActionPlan";
import NextDayFeedbackCard from "@/components/dashboard/NextDayFeedbackCard";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CheckIn, PlanSection, ScoreCardResult, WhatWorkedToday } from "@/lib/types";

interface TodayBriefingProps {
  scoreCard: ScoreCardResult;
  todayCheckIn: CheckIn | undefined;
  plan: PlanSection[];
  trend: number;
  dangerStreak: number;
  dangerDaysAhead: number;
  recoveryDate: string;
  reason: string;
  confidenceCopy: string;
  newLearning: string;
  whatWorkedToday: WhatWorkedToday | null;
}

export default function TodayBriefing({
  scoreCard,
  todayCheckIn,
  plan,
  trend,
  dangerStreak,
  dangerDaysAhead,
  recoveryDate,
  reason,
  confidenceCopy,
  newLearning,
  whatWorkedToday,
}: TodayBriefingProps) {
  return (
    <Card className="border-primary/15 bg-primary/[0.03]">
      <CardHeader className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-3xl tracking-tight">Today&apos;s Briefing</CardTitle>
          <Badge variant="secondary">{scoreCard.score.label}</Badge>
        </div>
        <p className="text-sm leading-7 text-muted-foreground">
          The fastest read on what matters today and what Overload has learned so far.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">What should I do today?</h2>
          <p className="text-2xl font-semibold text-foreground">{scoreCard.recommended_action.title}</p>
          <p className="text-sm leading-6 text-muted-foreground">{scoreCard.recommended_action.detail}</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Why this is showing up</h2>
          <p className="text-base leading-7 text-foreground">{reason}</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">How sure Overload is</h2>
          <p className="text-sm leading-6 text-muted-foreground">{confidenceCopy}</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">New learning</h2>
          <div className="rounded-xl border border-border/70 bg-background/90 p-4">
            <p className="font-medium text-foreground">{newLearning}</p>
          </div>
        </section>

        <ActionPlan
          score={scoreCard.score.score}
          trend={trend}
          dangerStreak={dangerStreak}
          dangerDaysAhead={dangerDaysAhead}
          recoveryDate={recoveryDate}
          plan={plan}
          note={todayCheckIn?.note ?? undefined}
          stress={todayCheckIn?.stress}
          consecutiveDays={dangerStreak}
          role={todayCheckIn?.role_snapshot ?? ""}
          smallWins={todayCheckIn?.small_wins ?? null}
        />

        <NextDayFeedbackCard whatWorked={whatWorkedToday} />
      </CardContent>
    </Card>
  );
}