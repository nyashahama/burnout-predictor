"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";

interface InsightRevealCardProps {
  patternInsights: { title: string; explanation: string; evidence: string; driver: string; confidence: string }[];
  whatWorks: string;
  checkInCount?: number;
}

export default function InsightRevealCard({ patternInsights, whatWorks }: InsightRevealCardProps) {
  const { api } = useAuth();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const undismissed = patternInsights.filter(
    (p) => !dismissed.has(`${p.driver}-${p.title}`)
  );

  if (undismissed.length === 0 && !whatWorks) return null;

  async function dismiss(driver: string, title: string) {
    try {
      await api.post("/api/insights/dismiss", {
        component_key: `pattern-${driver}`,
      });
      setDismissed((prev) => {
        const next = new Set(prev);
        next.add(`${driver}-${title}`);
        return next;
      });
    } catch {}
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>🔍 Insights</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {undismissed.map((pattern) => (
          <div key={`${pattern.driver}-${pattern.title}`} className="rounded-md border p-3">
            <p className="font-medium">{pattern.title}</p>
            <p className="text-sm text-muted-foreground">{pattern.explanation}</p>
            <button
              className="mt-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => dismiss(pattern.driver, pattern.title)}
            >
              Dismiss
            </button>
          </div>
        ))}
        {whatWorks && (
          <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
            <p className="font-medium">What works for you</p>
            <p className="text-sm">{whatWorks}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}