"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PlaybookSections } from "@/lib/types";

export default function PlaybookPanel({
  title,
  subtitle,
  playbook,
  compact = false,
}: {
  title: string;
  subtitle: string;
  playbook: PlaybookSections | null;
  compact?: boolean;
}) {
  const sections = [
    { heading: "Confirmed triggers", items: playbook?.confirmed_triggers ?? [] },
    { heading: "Confirmed recovery levers", items: playbook?.confirmed_recovery_levers ?? [] },
    { heading: "Experiments in progress", items: playbook?.experiments ?? [] },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent className={compact ? "space-y-4" : "grid gap-6 lg:grid-cols-3"}>
        {sections.map((section) => (
          <section key={section.heading} className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {section.heading}
            </h3>
            <div className="space-y-2">
              {section.items.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
                  Nothing here yet.
                </div>
              ) : (
                section.items.map((item) => (
                  <div key={item.key} className="rounded-lg border border-border/70 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium">{item.title}</div>
                      <Badge variant={item.state === "confirmed" ? "secondary" : "outline"}>{item.state}</Badge>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.detail}</p>
                    <p className="mt-2 text-xs uppercase tracking-[0.15em] text-muted-foreground">
                      {item.evidence_count} signals · {item.trend} · last seen {item.last_seen_date}
                    </p>
                  </div>
                ))
              )}
            </div>
          </section>
        ))}
      </CardContent>
    </Card>
  );
}