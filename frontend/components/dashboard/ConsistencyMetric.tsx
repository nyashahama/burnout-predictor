"use client";

interface ConsistencyMetricProps {
  consistencyPct: number;
}

export default function ConsistencyMetric({ consistencyPct }: ConsistencyMetricProps) {
  return (
    <div className="rounded-lg border border-border p-4">
      <div className="text-sm text-muted-foreground">Consistency</div>
      <div className="mt-2 text-2xl font-semibold">{consistencyPct}%</div>
      <p className="text-xs text-muted-foreground mt-1">
        Checked in {consistencyPct}% of the last 21 days
      </p>
    </div>
  );
}