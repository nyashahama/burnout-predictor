"use client";

import { useMemo } from "react";
import { RefreshCcw } from "lucide-react";
import { useDashboardData } from "@/contexts/DashboardDataContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateForDisplay, getTodayString } from "@/lib/date";
import type { CheckIn } from "@/lib/types";

type WeeklyDay = {
  key: string;
  label: string;
  score: number | null;
  stress: number | null;
  note: string | null;
};

const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function buildWeeklyData(checkins: CheckIn[]): WeeklyDay[] {
  const byDate = new Map(checkins.map((checkin) => [checkin.checked_in_date, checkin]));
  const days: WeeklyDay[] = [];

  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const key = getTodayString(date);
    const checkin = byDate.get(key);

    days.push({
      key,
      label: i === 0 ? "Today" : DAY_SHORT[date.getDay()],
      score: checkin?.score ?? null,
      stress: checkin?.stress ?? null,
      note: checkin?.note ?? null,
    });
  }

  return days;
}

function buildPreviousWeekData(checkins: CheckIn[]): WeeklyDay[] {
  const byDate = new Map(checkins.map((checkin) => [checkin.checked_in_date, checkin]));
  const days: WeeklyDay[] = [];

  for (let i = 13; i >= 7; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const key = getTodayString(date);
    const checkin = byDate.get(key);

    days.push({
      key,
      label: DAY_SHORT[date.getDay()],
      score: checkin?.score ?? null,
      stress: checkin?.stress ?? null,
      note: checkin?.note ?? null,
    });
  }

  return days;
}

function averageScore(days: WeeklyDay[]) {
  const realDays = days.filter((day) => day.score !== null);
  if (!realDays.length) return null;
  return Math.round(realDays.reduce((sum, day) => sum + (day.score ?? 0), 0) / realDays.length);
}

function buildWeeklyNarrative(days: WeeklyDay[], previousWeek: WeeklyDay[]) {
  const realDays = days.filter((day) => day.score !== null);
  if (!realDays.length) {
    return "No weekly pattern yet. Your first few check-ins will turn this into a real weekly read instead of a blank summary.";
  }

  const avg = averageScore(days) ?? 0;
  const previousAvg = averageScore(previousWeek);
  const peakDay = realDays.reduce((peak, day) => ((day.score ?? 0) > (peak.score ?? 0) ? day : peak), realDays[0]);
  const lowDays = realDays.filter((day) => (day.score ?? 100) <= 40);

  if (previousAvg !== null) {
    const delta = avg - previousAvg;
    if (delta >= 6) {
      return `This week ran ${delta} points heavier than the week before. ${peakDay.label} was the pressure point, so that is the day to redesign first.`;
    }
    if (delta <= -6) {
      return `This week came in ${Math.abs(delta)} points lighter than the week before. ${lowDays[0]?.label ?? "One of your lighter days"} is worth protecting because it is helping the week recover.`;
    }
  }

  if ((peakDay.score ?? 0) > 65) {
    return `${peakDay.label} was the clear spike this week. If next week only changes in one place, change that day before the pressure compounds.`;
  }

  if (lowDays.length >= 2) {
    return `${lowDays.map((day) => day.label).join(" and ")} gave you real breathing room this week. Guard those days instead of letting meetings flood them.`;
  }

  return "The week stayed relatively even. That is useful too: your load is steady enough that small changes could bend the next week in your favor.";
}

function buildNotePattern(days: WeeklyDay[]) {
  const notes = days
    .filter((day) => day.note)
    .map((day) => ({ day: day.label, note: day.note!.toLowerCase() }));

  if (!notes.length) return null;

  const keywordMap = [
    { keyword: "deadline", label: "deadlines" },
    { keyword: "meeting", label: "meetings" },
    { keyword: "sleep", label: "sleep" },
    { keyword: "travel", label: "travel" },
    { keyword: "launch", label: "launches" },
  ];

  for (const { keyword, label } of keywordMap) {
    const matches = notes.filter((entry) => entry.note.includes(keyword));
    if (matches.length) {
      return `${label[0].toUpperCase()}${label.slice(1)} showed up in your notes on ${matches.map((entry) => entry.day).join(" and ")}.`;
    }
  }

  return `You left context in ${notes.length} check-in note${notes.length > 1 ? "s" : ""}, which is enough to make the weekly read more specific than a raw score average.`;
}

export default function WeeklyPage() {
  const { checkins, loadingData, loadError, reload } = useDashboardData();

  const days = useMemo(() => buildWeeklyData(checkins), [checkins]);
  const previousWeek = useMemo(() => buildPreviousWeekData(checkins), [checkins]);
  const realDays = days.filter((day) => day.score !== null);
  const avg = realDays.length
    ? Math.round(realDays.reduce((sum, day) => sum + (day.score ?? 0), 0) / realDays.length)
    : 0;
  const peak = realDays.length ? Math.max(...realDays.map((day) => day.score ?? 0)) : 0;
  const peakDay = realDays.find((day) => day.score === peak) ?? null;
  const previousAvg = averageScore(previousWeek);
  const weeklyDelta = previousAvg === null ? null : avg - previousAvg;
  const completionRate = Math.round((realDays.length / 7) * 100);
  const lowDays = realDays.filter((day) => (day.score ?? 100) <= 40).length;
  const narrative = buildWeeklyNarrative(days, previousWeek);
  const notePattern = buildNotePattern(days);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-4xl tracking-tight">Weekly insights</h1>
        <p className="text-muted-foreground">A seven-day read of your load, patterns, and recovery windows based on saved backend check-ins.</p>
      </div>

      {loadError && (
        <Card>
          <CardContent className="flex items-center justify-between gap-4 p-6">
            <p className="text-sm text-destructive">{loadError}</p>
            <Button variant="outline" onClick={() => void reload()}>
              <RefreshCcw className="h-4 w-4" />
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Check-ins this week</CardDescription>
            <CardTitle className="text-3xl">{loadingData ? "…" : realDays.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Average strain</CardDescription>
            <CardTitle className="text-3xl">{loadingData ? "…" : avg}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Peak day</CardDescription>
            <CardTitle className="text-3xl">{loadingData ? "…" : peakDay?.label ?? "—"}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Vs last week</CardDescription>
            <CardTitle className="text-3xl">
              {loadingData ? "…" : weeklyDelta === null ? "—" : weeklyDelta > 0 ? `+${weeklyDelta}` : String(weeklyDelta)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {weeklyDelta === null
              ? "A comparison unlocks after two weeks of real check-ins."
              : weeklyDelta >= 0
              ? "Heavier than the prior week."
              : "Lighter than the prior week."}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Consistency</CardDescription>
            <CardTitle className="text-3xl">{loadingData ? "…" : `${completionRate}%`}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {realDays.length === 7
              ? "You logged every day this week."
              : `${realDays.length} of 7 days have real check-ins.`}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Recovery days</CardDescription>
            <CardTitle className="text-3xl">{loadingData ? "…" : lowDays}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Days fully in the zone at 40 or below.
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>What this week says</CardTitle>
          <CardDescription>A plain-language read of the last seven days.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm leading-7 text-muted-foreground">{loadingData ? "Loading weekly read…" : narrative}</p>
          {notePattern && (
            <div className="rounded-lg border border-border bg-secondary/30 p-4 text-sm leading-6 text-muted-foreground">
              {notePattern}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>This week</CardTitle>
          <CardDescription>Each bar reflects the saved backend score for that day, with your daily stress attached where available.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingData ? (
            <p className="text-sm text-muted-foreground">Loading weekly data…</p>
          ) : (
            <>
              <div className="grid grid-cols-7 gap-3" aria-label="Weekly score bars">
                {days.map((day) => (
                  <div key={day.key} className="flex flex-col items-center gap-3">
                    <div className="text-xs font-medium text-muted-foreground">{day.label}</div>
                    <div className="flex h-40 w-full items-end rounded-lg bg-muted p-2">
                      <div
                        className="w-full rounded-md bg-primary transition-all"
                        role="img"
                        aria-label={`${day.label}: ${day.score ?? "no"} score${day.stress ? `, stress ${day.stress}` : ""}`}
                        style={{
                          height: `${Math.max(day.score ?? 8, 8)}%`,
                          opacity: day.score === null ? 0.2 : 1,
                        }}
                      />
                    </div>
                    <div className="text-center text-sm font-medium">
                      {day.score ?? "—"}
                      <div className="text-[11px] text-muted-foreground">{day.stress ? `stress ${day.stress}` : "no log"}</div>
                    </div>
                  </div>
                ))}
              </div>

              {peakDay?.note && (
                <div className="rounded-lg border border-border bg-secondary/40 p-4 text-sm leading-6">
                  <span className="font-medium">Peak-day note:</span> {peakDay.note}
                </div>
              )}

              {realDays.length === 0 && (
                <Badge variant="outline">No check-ins recorded in the last 7 days yet.</Badge>
              )}

              {realDays.length > 0 && (
                <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
                  Latest check-in: {formatDateForDisplay(checkins[0]?.checked_in_date ?? "")}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
