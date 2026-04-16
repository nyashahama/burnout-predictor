"use client";

import { useEffect, useState } from "react";
import {
  type PlanSection,
  buildDynamicRecoveryPlan,
} from "@/app/dashboard/data";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

function getNoteContext(note?: string): string | null {
  if (!note) return null;
  const n = note.toLowerCase();
  if (/deadline|deliver|submit|due|launch/.test(n))
    return "You mentioned deadlines — these actions are calibrated to that.";
  if (/meeting|call|sync|standup|presentation|demo/.test(n))
    return "Heavy meeting load noted — these actions address fragmentation specifically.";
  if (/sleep|tired|exhausted|insomnia/.test(n))
    return "Sleep came up in your note — that's the lever these actions focus on.";
  if (/travel|trip|flight/.test(n))
    return "Travel disrupts your baseline — these actions account for that.";
  return null;
}

const STORAGE_KEY = `recovery-checked-${new Date().toISOString().split("T")[0]}`;

export default function RecoveryPlan({
  plan,
  score,
  note,
  stress,
  consecutiveDays,
  role,
}: {
  plan: PlanSection[];
  score: number;
  note?: string;
  stress?: number;
  consecutiveDays?: number;
  role?: string;
}) {
  const effectivePlan =
    stress !== undefined
      ? buildDynamicRecoveryPlan({
          note,
          stress,
          consecutiveDays: consecutiveDays ?? 0,
          role: role ?? "engineer",
        })
      : plan;

  const allActions = effectivePlan.flatMap((s) => s.actions);
  const [checked, setChecked] = useState<boolean[]>(() =>
    new Array(allActions.length).fill(false)
  );

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === allActions.length) {
          setChecked(parsed);
        }
      } catch {}
    }
  }, [allActions.length]);

  if (score <= 65) return null;

  function toggle(globalIndex: number) {
    setChecked((prev) => {
      const next = [...prev];
      next[globalIndex] = !next[globalIndex];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }

  const noteContext = getNoteContext(note);
  const done = checked.filter(Boolean).length;
  const total = allActions.length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  let globalIndex = 0;

  return (
    <Card className="border-primary/15 bg-primary/[0.03]">
      <CardHeader className="gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <CardTitle className="text-2xl">How to pull back</CardTitle>
          <CardDescription>
            Small moves. Real difference by the weekend.
          </CardDescription>
        </div>
        <div className="min-w-44 space-y-2">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-medium text-foreground">{done}/{total} done</span>
            <Badge variant="secondary">{pct}%</Badge>
          </div>
          <div
            role="progressbar"
            aria-label="Recovery plan progress"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={done}
            aria-valuetext={`${done} of ${total} actions completed`}
            className="h-2 overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </CardHeader>

      {noteContext && (
        <CardContent className="pt-0">
          <div className="rounded-lg border border-primary/15 bg-background/80 px-4 py-3 text-sm text-muted-foreground">
            {noteContext}
          </div>
        </CardContent>
      )}

      <CardContent className="space-y-4">
        {effectivePlan.map((section) => (
          <section
            key={section.timing}
            className="rounded-xl border border-border/70 bg-background/90 p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {section.timing}
              </h3>
              <Badge variant="outline">{section.actions.length} actions</Badge>
            </div>
            <div className="mt-3 space-y-2">
              {section.actions.map((action) => {
                const idx = globalIndex++;
                const isChecked = checked[idx];
                return (
                  <label
                    key={idx}
                    className={cn(
                      "flex items-start gap-3 rounded-lg border px-3 py-3 text-sm transition-colors",
                      isChecked
                        ? "border-primary/25 bg-primary/10"
                        : "border-border/70 bg-background hover:bg-accent/40",
                    )}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
                      checked={isChecked}
                      onChange={() => toggle(idx)}
                    />
                    <span
                      className={cn(
                        "leading-6 text-foreground",
                        isChecked && "text-muted-foreground line-through",
                      )}
                    >
                      {action}
                    </span>
                  </label>
                );
              })}
            </div>
          </section>
        ))}
      </CardContent>

      {total > 0 && done === total && (
        <CardContent className="pt-0">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Done. Sleep and space are the most effective tools you have. Check in tomorrow and the score should reflect it.
          </div>
        </CardContent>
      )}
    </Card>
  );
}
