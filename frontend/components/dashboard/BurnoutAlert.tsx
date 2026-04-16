"use client";

import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  CalendarRange,
  Footprints,
  MoonStar,
  TriangleAlert,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function buildAlertBody(
  score: number,
  dangerStreak: number,
  trend: number,
  dangerDaysAhead: number,
  recoveryDate: string,
): string {
  const streakPhrase =
    dangerStreak >= 4
      ? `${dangerStreak} days running at high load. That's not a rough day — it's a sustained period.`
      : dangerStreak >= 2
      ? `${dangerStreak} days in a row above the threshold.`
      : "You're in the red today.";

  const contextPhrase =
    trend > 5
      ? ` The load has been climbing — up ${trend} points this week.`
      : ` Score is at ${score}.`;

  const forecastPhrase =
    dangerDaysAhead > 0
      ? ` The forecast doesn't clear until ${recoveryDate}. There's a window right now to shorten that — but only if something changes today.`
      : ` The forecast starts to ease soon. Tonight matters.`;

  return streakPhrase + contextPhrase + forecastPhrase;
}

export default function BurnoutAlert({
  score,
  trend,
  dangerStreak,
  dangerDaysAhead,
  recoveryDate,
}: {
  score: number;
  trend: number;
  dangerStreak: number;
  dangerDaysAhead: number;
  recoveryDate: string;
}) {
  const { api } = useAuth();
  const [dismissed, setDismissed] = useState(false);

  if (score <= 65 || dismissed) return null;

  function dismiss() {
    setDismissed(true);
    void api.post("/api/insights/dismiss", { component_key: `burnout-alert-${new Date().toISOString().split("T")[0]}` });
  }

  const body = buildAlertBody(score, dangerStreak, trend, dangerDaysAhead, recoveryDate);
  const actions = [
    {
      icon: MoonStar,
      text: "Sleep 8+ hours tonight. Set a hard shutdown at 10 PM. It's your highest-leverage action right now.",
    },
    {
      icon: CalendarRange,
      text: "Block tomorrow 9-11 AM before your calendar fills. Guard it like an appointment you can't move.",
    },
    {
      icon: Footprints,
      text: "Take twenty minutes outside today without your phone. Movement lowers cortisol faster than another hour at your desk.",
    },
  ];

  return (
    <Card role="alert" className="border-destructive/25 bg-destructive/5">
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-destructive/10 p-2 text-destructive">
            <TriangleAlert className="h-5 w-5" />
          </div>
          <div className="space-y-2">
            <CardTitle className="text-2xl">Something&apos;s building.</CardTitle>
            <p className="text-sm leading-6 text-muted-foreground">{body}</p>
          </div>
        </div>
        <Button type="button" variant="ghost" size="icon" aria-label="Dismiss" onClick={dismiss}>
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {actions.map((action) => (
          <div
            key={action.text}
            className="flex items-start gap-3 rounded-lg border border-border/70 bg-background/90 px-4 py-3 text-sm leading-6"
          >
            <div className="rounded-full bg-primary/10 p-2 text-primary">
              <action.icon className="h-4 w-4" />
            </div>
            <span>{action.text}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
