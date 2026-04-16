"use client";

import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import type { InsightBundle } from "@/lib/types";

interface Props {
  bundle: InsightBundle | null;
}

export default function PersonalizedInsight({ bundle }: Props) {
  const { api } = useAuth();
  const [dismissError, setDismissError] = useState("");

  async function dismiss(componentKey: string) {
    try {
      await api.post("/api/insights/dismiss", { component_key: componentKey });
      setDismissError("");
    } catch {
      setDismissError("Could not dismiss this insight right now.");
    }
  }

  if (!bundle) return null;

  const {
    session_context,
    patterns,
    arc_narrative,
    signature_narrative,
    monthly_arc,
    what_works,
    milestone,
    dismissed_components,
  } = bundle;

  const dismissed = new Set(dismissed_components ?? []);
  const sections = [
    session_context && !dismissed.has("session_context")
      ? {
          key: "session_context",
          label: "Session context",
          content: (
            <p className="text-sm leading-6 text-muted-foreground">
              {session_context.Message}
            </p>
          ),
        }
      : null,
    patterns && patterns.length > 0 && !dismissed.has("patterns")
      ? {
          key: "patterns",
          label: "Recurring patterns",
          content: (
            <ul className="space-y-2 text-sm leading-6 text-muted-foreground">
              {patterns.map((pattern, index) => (
                <li key={index} className="rounded-lg border border-border/70 bg-background/80 px-3 py-2">
                  {pattern}
                </li>
              ))}
            </ul>
          ),
        }
      : null,
    arc_narrative && !dismissed.has("arc_narrative")
      ? {
          key: "arc_narrative",
          label: "Longer arc",
          content: (
            <p className="text-sm leading-6 text-muted-foreground">
              {arc_narrative}
            </p>
          ),
        }
      : null,
    signature_narrative && !dismissed.has("signature_narrative")
      ? {
          key: "signature_narrative",
          label: "Signature pattern",
          content: (
            <p className="text-sm leading-6 text-muted-foreground">
              {signature_narrative}
            </p>
          ),
        }
      : null,
    monthly_arc?.Message && !dismissed.has("monthly_arc")
      ? {
          key: "monthly_arc",
          label: "Monthly arc",
          content: (
            <p className="text-sm leading-6 text-muted-foreground">
              {monthly_arc.Message}
            </p>
          ),
        }
      : null,
    what_works && !dismissed.has("what_works")
      ? {
          key: "what_works",
          label: "What helps",
          content: (
            <p className="text-sm leading-6 text-muted-foreground">
              {what_works}
            </p>
          ),
        }
      : null,
    milestone && !dismissed.has("milestone")
      ? {
          key: "milestone",
          label: "Milestone",
          content: (
            <p className="text-sm leading-6 text-muted-foreground">
              {milestone.Milestone}-check-in milestone reached.
            </p>
          ),
        }
      : null,
  ].filter(Boolean) as Array<{
    key: string;
    label: string;
    content: ReactNode;
  }>;

  return (
    <Card className="border-primary/10">
      <CardHeader className="space-y-3">
        <div className="flex items-center gap-3">
          <Badge variant="secondary">Data-backed insight</Badge>
          <CardDescription>Patterns from your saved history</CardDescription>
        </div>
        <CardTitle className="text-2xl">What your data says</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {dismissError && (
          <div
            className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            role="alert"
          >
            {dismissError}
          </div>
        )}

        {sections.map((section) => (
          <section
            key={section.key}
            className="rounded-xl border border-border/70 bg-background/90 p-4"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {section.label}
                </h3>
                {section.content}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="shrink-0"
                onClick={() => dismiss(section.key)}
              >
                Dismiss
              </Button>
            </div>
          </section>
        ))}
      </CardContent>
    </Card>
  );
}
