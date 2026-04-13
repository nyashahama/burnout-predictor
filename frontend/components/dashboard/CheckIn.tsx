"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import type { CheckIn, FollowUpInfo, UpsertCheckInResult } from "@/lib/types";
import { getTodayString } from "@/lib/date";

const stressLevels = [
  { value: 1, label: "Very calm" },
  { value: 2, label: "Relaxed" },
  { value: 3, label: "Moderate" },
  { value: 4, label: "Stressed" },
  { value: 5, label: "Overwhelmed" },
];

const levelButtons = [
  { value: 1, label: "1" },
  { value: 2, label: "2" },
  { value: 3, label: "3" },
  { value: 4, label: "4" },
  { value: 5, label: "5" },
];

const symptomOptions = ["headache", "muscle_tension", "fatigue", "trouble_sleeping", "appetite_changes"];

export default function CheckIn({
  checkins,
  followUp,
  onComplete,
  onDismissFollowUp,
}: {
  checkins: CheckIn[];
  followUp: FollowUpInfo | null;
  onComplete?: (result: UpsertCheckInResult) => void;
  onDismissFollowUp?: () => void;
}) {
  const { api } = useAuth();
  const today = getTodayString();
  const existing = useMemo(() => checkins.find((item) => item.checked_in_date === today), [checkins, today]);
  const [stress, setStress] = useState<number | null>(existing?.stress ?? null);
  const [note, setNote] = useState(existing?.note ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(Boolean(existing));
  const [expanded, setExpanded] = useState(false);
  const [energyLevel, setEnergyLevel] = useState<number | null>(existing?.energy_level ?? null);
  const [focusQuality, setFocusQuality] = useState<number | null>(existing?.focus_quality ?? null);
  const [hoursWorked, setHoursWorked] = useState(existing?.hours_worked != null ? String(existing.hours_worked) : "");
  const [smallWins, setSmallWins] = useState(existing?.small_wins ?? "");
  const [physicalSymptoms, setPhysicalSymptoms] = useState<string[]>(existing?.physical_symptoms ?? []);
  const [followUpAnswer, setFollowUpAnswer] = useState("");

  function toggleSymptom(symptom: string) {
    setPhysicalSymptoms((prev) =>
      prev.includes(symptom) ? prev.filter((s) => s !== symptom) : [...prev, symptom],
    );
  }

  const reflectionPrompt = (() => {
    if (stress == null) return null;
    if (stress >= 4) return "What's one thing you could do tomorrow to lighten the load?";
    if (stress <= 2) return "What kept you steady today?";
    return "What's on your mind?";
  })();

  async function handleSubmit() {
    if (!stress) return;
    setSubmitting(true);
    setError("");
    try {
      let finalNote = note.trim();
      if (followUpAnswer.trim()) {
        finalNote = finalNote
          ? `${finalNote}\n\n---\n${followUpAnswer.trim()}`
          : followUpAnswer.trim();
      }

      const payload: Record<string, unknown> = {
        stress,
        note: finalNote,
      };

      if (smallWins.trim()) payload.small_wins = smallWins.trim();
      if (energyLevel != null) payload.energy_level = energyLevel;
      if (focusQuality != null) payload.focus_quality = focusQuality;
      if (hoursWorked !== "") payload.hours_worked = Number(hoursWorked);
      if (physicalSymptoms.length > 0) payload.physical_symptoms = physicalSymptoms;

      const result = await api.post<UpsertCheckInResult>("/api/checkins", payload);
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
        <CardTitle>{submitted ? "Check-in logged" : "How are you?"}</CardTitle>
        <CardDescription>
          {submitted ? "Today is already logged. Update it if something changed." : "How are you?"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {followUp && !submitted && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
            <p className="text-sm font-medium">{followUp.question}</p>
            <Textarea
              placeholder="Reflect on how it went..."
              value={followUpAnswer}
              onChange={(e) => setFollowUpAnswer(e.target.value)}
              rows={2}
              className="mt-2"
            />
            {onDismissFollowUp && (
              <button
                className="mt-1 text-xs text-muted-foreground underline"
                onClick={onDismissFollowUp}
              >
                Skip this
              </button>
            )}
          </div>
        )}

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

        {!submitted && (
          <button
            type="button"
            className="text-sm text-primary underline"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "Less detail ▲" : "Tell me more? ▼"}
          </button>
        )}

        {expanded && (
          <div className="space-y-4 rounded-lg border border-border p-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Energy level</label>
              <div className="flex gap-2">
                {levelButtons.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-lg border text-sm font-medium transition-colors",
                      energyLevel === opt.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background hover:bg-accent",
                    )}
                    onClick={() => setEnergyLevel(opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Focus quality</label>
              <div className="flex gap-2">
                {levelButtons.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-lg border text-sm font-medium transition-colors",
                      focusQuality === opt.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background hover:bg-accent",
                    )}
                    onClick={() => setFocusQuality(opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="checkin-hours" className="text-sm font-medium">Hours worked</label>
              <Input
                id="checkin-hours"
                type="number"
                min="0"
                max="24"
                step="0.5"
                placeholder="e.g. 8"
                value={hoursWorked}
                onChange={(e) => setHoursWorked(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="checkin-wins" className="text-sm font-medium">Small wins</label>
              <Textarea
                id="checkin-wins"
                placeholder="Something that went well today, however small."
                value={smallWins}
                onChange={(e) => setSmallWins(e.target.value)}
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Physical symptoms</label>
              <div className="flex flex-wrap gap-2">
                {symptomOptions.map((symptom) => (
                  <button
                    key={symptom}
                    type="button"
                    className={cn(
                      "rounded-full border px-3 py-1 text-sm transition-colors",
                      physicalSymptoms.includes(symptom)
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background hover:bg-accent",
                    )}
                    onClick={() => toggleSymptom(symptom)}
                  >
                    {symptom.replace(/_/g, " ")}
                  </button>
                ))}
              </div>
            </div>

            {reflectionPrompt && (
              <div className="space-y-2">
                <p className="text-sm italic text-muted-foreground">{reflectionPrompt}</p>
              </div>
            )}
          </div>
        )}

        {error && <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">{error}</div>}

        <Button onClick={handleSubmit} disabled={!stress || submitting}>
          {submitting ? "Saving…" : submitted ? "Update today's check-in" : "Log check-in"}
        </Button>
      </CardContent>
    </Card>
  );
}