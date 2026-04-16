"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PersonalizationProgressSummary } from "@/lib/types";

export default function PersonalizationProgress({
  progress,
  accuracyLabel,
}: {
  progress: PersonalizationProgressSummary | null;
  accuracyLabel: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Personalization Progress</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-4">
        <div>
          <div className="text-sm text-muted-foreground">Confirmed triggers</div>
          <div className="mt-2 text-3xl font-semibold">{progress?.confirmed_triggers ?? 0}</div>
        </div>
        <div>
          <div className="text-sm text-muted-foreground">Recovery levers</div>
          <div className="mt-2 text-3xl font-semibold">{progress?.confirmed_recovery_levers ?? 0}</div>
        </div>
        <div>
          <div className="text-sm text-muted-foreground">Experiments</div>
          <div className="mt-2 text-3xl font-semibold">{progress?.experiments ?? 0}</div>
        </div>
        <div>
          <div className="text-sm text-muted-foreground">Confidence trend</div>
          <div className="mt-2 flex items-center gap-2">
            <Badge variant="outline">{progress?.confidence_trend ?? "calibrating"}</Badge>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{accuracyLabel}</p>
        </div>
      </CardContent>
    </Card>
  );
}