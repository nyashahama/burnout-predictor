"use client";

import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getTodayString } from "@/lib/date";
import { safeParseJson, safeStorageGet } from "@/lib/storage";

type WeeklyDay = {
  label: string;
  score: number | null;
  note: string | null;
};

function computeScore(stress: number, role: string, sleep: string) {
  const base: Record<number, number> = { 1: 22, 2: 35, 3: 50, 4: 64, 5: 76 };
  const roleMod: Record<string, number> = { founder: 6, manager: 3, pm: 2, engineer: 0, designer: -2, other: 0 };
  const sleepMod: Record<string, number> = { "6": 10, "7": 5, "8": 0, "9": -4 };
  return Math.max(8, Math.min(92, (base[stress] ?? 50) + (roleMod[role] ?? 0) + (sleepMod[sleep] ?? 0)));
}

function getWeeklyData() {
  const role = safeStorageGet(localStorage, "overload-role") || "engineer";
  const sleep = safeStorageGet(localStorage, "overload-sleep") || "8";
  const short = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const days: WeeklyDay[] = [];

  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const key = `checkin-${getTodayString(date)}`;
    const raw = safeStorageGet(localStorage, key);
    const parsed = safeParseJson<{ stress?: number; note?: string }>(raw, {});
    days.push({
      label: i === 0 ? "Today" : short[date.getDay()],
      score: typeof parsed.stress === "number" ? computeScore(parsed.stress, role, sleep) : null,
      note: typeof parsed.note === "string" ? parsed.note : null,
    });
  }

  return days;
}

export default function WeeklyPage() {
  const days = useMemo(() => (typeof window === "undefined" ? [] : getWeeklyData()), []);
  const realDays = days.filter((day) => day.score !== null);
  const avg = realDays.length ? Math.round(realDays.reduce((sum, day) => sum + (day.score ?? 0), 0) / realDays.length) : 0;
  const peak = realDays.length ? Math.max(...realDays.map((day) => day.score ?? 0)) : 0;
  const peakDay = realDays.find((day) => day.score === peak);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-4xl tracking-tight">Weekly view</h1>
        <p className="text-muted-foreground">A simple summary of your last seven check-ins.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Check-ins logged</CardDescription>
            <CardTitle className="text-3xl">{realDays.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Average strain</CardDescription>
            <CardTitle className="text-3xl">{avg}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Peak day</CardDescription>
            <CardTitle className="text-3xl">{peakDay?.label ?? "—"}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>This week</CardTitle>
          <CardDescription>Each bar reflects your recorded score for that day.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-7 gap-3">
            {days.map((day) => (
              <div key={day.label} className="flex flex-col items-center gap-3">
                <div className="text-xs font-medium text-muted-foreground">{day.label}</div>
                <div className="flex h-40 w-full items-end rounded-lg bg-muted p-2">
                  <div
                    className="w-full rounded-md bg-primary transition-all"
                    style={{ height: `${Math.max(day.score ?? 8, 8)}%`, opacity: day.score === null ? 0.2 : 1 }}
                  />
                </div>
                <div className="text-sm font-medium">{day.score ?? "—"}</div>
              </div>
            ))}
          </div>
          {peakDay?.note && (
            <div className="rounded-lg border border-border bg-secondary/40 p-4 text-sm leading-6">
              <span className="font-medium">Peak-day note:</span> {peakDay.note}
            </div>
          )}
          {realDays.length === 0 && (
            <Badge variant="outline">You need a few check-ins before the weekly view becomes useful.</Badge>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
