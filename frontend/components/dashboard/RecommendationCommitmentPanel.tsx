"use client";

import { Button } from "@/components/ui/button";
import type { BriefingRecommendation, RecommendationCommitment } from "@/lib/types";

interface RecommendationCommitmentPanelProps {
  recommendation: BriefingRecommendation | null;
  activeCommitment: RecommendationCommitment | null;
  onCommit: () => Promise<void> | void;
  onComplete: (id: string) => Promise<void> | void;
  onSkip: (id: string) => Promise<void> | void;
}

export default function RecommendationCommitmentPanel({
  recommendation,
  activeCommitment,
  onCommit,
  onComplete,
  onSkip,
}: RecommendationCommitmentPanelProps) {
  if (activeCommitment) {
    return (
      <section className="space-y-3">
        <div className="bg-muted rounded-lg p-4">
          <p className="text-sm font-medium">You committed to this</p>
          <p className="text-lg mt-1">{activeCommitment.recommendation_title}</p>
          {activeCommitment.status === "committed" && (
            <div className="flex gap-2 mt-4">
              <Button onClick={() => onComplete(activeCommitment.id)} size="sm">
                Mark done
              </Button>
              <Button onClick={() => onSkip(activeCommitment.id)} variant="outline" size="sm">
                Couldn&apos;t do it
              </Button>
            </div>
          )}
        </div>
      </section>
    );
  }

  if (!recommendation) {
    return null;
  }

  return (
    <section className="space-y-3">
      <Button onClick={onCommit} className="w-full">
        Commit to this
      </Button>
    </section>
  );
}
