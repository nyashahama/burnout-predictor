"use client";

import { RefreshCcw } from "lucide-react";
import { useDashboardData } from "@/contexts/DashboardDataContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateForDisplay } from "@/lib/date";

export default function HistoryPage() {
  const { checkins, loadingData, loadError, reload } = useDashboardData();

  const scores = checkins.map((entry) => entry.score);
  const average = scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : 0;
  const peak = scores.length ? Math.max(...scores) : 0;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-4xl tracking-tight">History</h1>
        <p className="text-muted-foreground">Every logged check-in, with the most recent entries first.</p>
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
            <CardDescription>Entries</CardDescription>
            <CardTitle className="text-3xl">{checkins.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Average score</CardDescription>
            <CardTitle className="text-3xl">{average}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Highest score</CardDescription>
            <CardTitle className="text-3xl">{peak}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Check-in log</CardTitle>
          <CardDescription>{loadingData ? "Loading entries…" : "Your recorded history."}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loadingData ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : checkins.length === 0 ? (
            <p className="text-sm text-muted-foreground">No data yet. Your first check-in will populate this page.</p>
          ) : (
            checkins.map((entry) => (
              <div key={entry.id} className="rounded-lg border border-border p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-medium">{formatDateForDisplay(entry.checked_in_date)}</div>
                    <div className="text-sm text-muted-foreground">{entry.note || "No note recorded."}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm sm:flex sm:items-center">
                    <div>
                      <div className="text-muted-foreground">Stress</div>
                      <div className="font-medium">{entry.stress}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Score</div>
                      <div className="font-medium">{entry.score}</div>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
