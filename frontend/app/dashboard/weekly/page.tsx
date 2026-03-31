"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCcw } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { parseCheckIns } from "@/lib/validators";
import { formatDateForDisplay, getTodayString } from "@/lib/date";
import type { CheckIn } from "@/lib/types";

type WeeklyDay = {
  key: string;
  label: string;
  score: number | null;
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
      note: checkin?.note ?? null,
    });
  }

  return days;
}

export default function WeeklyPage() {
  const { api } = useAuth();
  const [checkins, setCheckins] = useState<CheckIn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadWeekly = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api.get("/api/checkins", parseCheckIns);
      setCheckins(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load weekly data.");
      setCheckins([]);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void loadWeekly();
  }, [loadWeekly]);

  const days = useMemo(() => buildWeeklyData(checkins), [checkins]);
  const realDays = days.filter((day) => day.score !== null);
  const avg = realDays.length
    ? Math.round(realDays.reduce((sum, day) => sum + (day.score ?? 0), 0) / realDays.length)
    : 0;
  const peak = realDays.length ? Math.max(...realDays.map((day) => day.score ?? 0)) : 0;
  const peakDay = realDays.find((day) => day.score === peak) ?? null;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-4xl tracking-tight">Weekly view</h1>
        <p className="text-muted-foreground">A summary of your last seven days, based on backend check-ins.</p>
      </div>

      {error && (
        <Card>
          <CardContent className="flex items-center justify-between gap-4 p-6">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" onClick={() => void loadWeekly()}>
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
            <CardTitle className="text-3xl">{loading ? "…" : realDays.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Average strain</CardDescription>
            <CardTitle className="text-3xl">{loading ? "…" : avg}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Peak day</CardDescription>
            <CardTitle className="text-3xl">{loading ? "…" : peakDay?.label ?? "—"}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>This week</CardTitle>
          <CardDescription>Each bar reflects the saved backend score for that day.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading weekly data…</p>
          ) : (
            <>
              <div className="grid grid-cols-7 gap-3">
                {days.map((day) => (
                  <div key={day.key} className="flex flex-col items-center gap-3">
                    <div className="text-xs font-medium text-muted-foreground">{day.label}</div>
                    <div className="flex h-40 w-full items-end rounded-lg bg-muted p-2">
                      <div
                        className="w-full rounded-md bg-primary transition-all"
                        style={{
                          height: `${Math.max(day.score ?? 8, 8)}%`,
                          opacity: day.score === null ? 0.2 : 1,
                        }}
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
