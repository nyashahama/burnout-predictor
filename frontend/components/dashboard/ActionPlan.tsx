"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { type PlanSection } from "@/lib/types";
import BurnoutAlert from "./BurnoutAlert";
import RecoveryPlan from "./RecoveryPlan";

interface ActionPlanProps {
  score: number;
  trend: number;
  dangerStreak: number;
  dangerDaysAhead: number;
  recoveryDate: string;
  plan: PlanSection[];
  note?: string;
  stress?: number;
  consecutiveDays?: number;
  role?: string;
  smallWins: string | null;
}

function getTier(score: number) {
  if (score > 65) return { label: "High strain", tier: "danger" as const };
  if (score > 40) return { label: "Moderate load", tier: "caution" as const };
  return { label: "In your zone", tier: "safe" as const };
}

export default function ActionPlan({
  score,
  trend,
  dangerStreak,
  dangerDaysAhead,
  recoveryDate,
  plan,
  note,
  stress,
  consecutiveDays,
  role,
  smallWins,
}: ActionPlanProps) {
  const { label, tier } = getTier(score);

  if (tier === "safe") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Keep it going
            <Badge variant="secondary">{label}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p>Your score is {score} — in the green. Protect what&apos;s working.</p>
          {smallWins && (
            <p className="mt-2 rounded-md bg-green-50 px-3 py-2 text-sm font-medium text-green-800">
              Yesterday you logged: {smallWins} — keep that up.
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  if (tier === "caution") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Ease the load
            <Badge variant="secondary">{label}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {plan.slice(0, 3).map((section) => (
              <div key={section.timing}>
                <div className="mb-1 text-sm font-semibold text-muted-foreground">
                  {section.timing}
                </div>
                <ul className="ml-4 list-disc space-y-1 text-sm">
                  {section.actions.map((action) => (
                    <li key={action}>{action}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <BurnoutAlert
        score={score}
        trend={trend}
        dangerStreak={dangerStreak}
        dangerDaysAhead={dangerDaysAhead}
        recoveryDate={recoveryDate}
      />
      <RecoveryPlan
        plan={plan}
        score={score}
        note={note}
        stress={stress}
        consecutiveDays={consecutiveDays}
        role={role}
      />
    </>
  );
}