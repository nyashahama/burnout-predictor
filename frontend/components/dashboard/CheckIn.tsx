"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import type { CheckIn, UpsertCheckInResult } from "@/lib/types";
import { getTodayString } from "@/lib/date";

const stressLevels = [
  { value: 1, label: "Very calm" },
  { value: 2, label: "Relaxed" },
  { value: 3, label: "Moderate" },
  { value: 4, label: "Stressed" },
  { value: 5, label: "Overwhelmed" },
];

export default function CheckIn({
  checkins,
  onComplete,
}: {
  checkins: CheckIn[];
  streakFromApi: number;
  onComplete?: (result: UpsertCheckInResult) => void;
}) {
  const { api } = useAuth();
  const today = getTodayString();
  const existing = useMemo(() => checkins.find((item) => item.checked_in_date === today), [checkins, today]);
  const [stress, setStress] = useState<number | null>(existing?.stress ?? null);
  const [note, setNote] = useState(existing?.note ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(Boolean(existing));

  async function handleSubmit() {
    if (!stress) return;
    setSubmitting(true);
    setError("");
    try {
      const result = await api.post<UpsertCheckInResult>("/api/checkins", {
        stress,
        note: note.trim(),
      });
      onComplete?.(result);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your check-in.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Daily check-in</CardTitle>
        <CardDescription>
          {submitted ? "Today is already logged. Update it if something changed." : "How are you carrying it today?"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          className="grid grid-cols-2 gap-3 sm:grid-cols-5"
          role="radiogroup"
          aria-label="Stress level"
        >
          {stressLevels.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={stress === option.value}
              aria-pressed={stress === option.value}
              className={cn(
                "rounded-lg border px-3 py-4 text-left text-sm transition-colors",
                stress === option.value ? "border-primary bg-primary/10 text-primary" : "border-border bg-background hover:bg-accent",
              )}
              onClick={() => setStress(option.value)}
            >
              <div className="text-lg font-semibold">{option.value}</div>
              <div className="mt-1 text-muted-foreground">{option.label}</div>
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <label htmlFor="checkin-note" className="text-sm font-medium">
            Context for today
          </label>
          <Textarea
            id="checkin-note"
            placeholder="Anything behind it? Deadlines, sleep, meetings, or anything else that explains today's load."
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={4}
            aria-describedby="checkin-note-help"
          />
          <p id="checkin-note-help" className="text-sm text-muted-foreground">
            Specific notes help the dashboard explain your patterns later.
          </p>
        </div>

        {error && <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">{error}</div>}

        <Button onClick={handleSubmit} disabled={!stress || submitting}>
          {submitting ? "Saving…" : submitted ? "Update today’s check-in" : "Log check-in"}
        </Button>
      </CardContent>
    </Card>
  );
}
