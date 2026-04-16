"use client";

import RecommendationCommitmentPanel from "@/components/dashboard/RecommendationCommitmentPanel";
import RecommendationFeedback from "@/components/dashboard/RecommendationFeedback";
import type { BriefingRecommendation, RecommendationCommitment, ScoreCardResult } from "@/lib/types";

export default function BriefingRecommendationSection({
  recommendation,
  legacyAction,
  feedbackSubmittedForToday,
  activeCommitment,
  onCommitRecommendation,
  onCompleteCommitment,
  onSkipCommitment,
}: {
  recommendation: BriefingRecommendation | null;
  legacyAction: ScoreCardResult["recommended_action"];
  feedbackSubmittedForToday: string | null;
  activeCommitment: RecommendationCommitment | null;
  onCommitRecommendation: () => Promise<void>;
  onCompleteCommitment: (id: string) => Promise<void>;
  onSkipCommitment: (id: string) => Promise<void>;
}) {
  const primaryKey = recommendation?.primary_action.key ?? legacyAction.driver;

  if (!recommendation) {
    return (
      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">What should I do today?</h2>
        <p className="text-2xl font-semibold text-foreground">{legacyAction.title}</p>
        <p className="text-sm leading-6 text-muted-foreground">{legacyAction.detail}</p>
        <RecommendationFeedback
          recommendedActionKey={primaryKey}
          feedbackSubmittedForToday={feedbackSubmittedForToday}
        />
        <RecommendationCommitmentPanel
          recommendation={null}
          activeCommitment={activeCommitment}
          onCommit={onCommitRecommendation}
          onComplete={onCompleteCommitment}
          onSkip={onSkipCommitment}
        />
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">{recommendation.headline}</h2>
      <p className="text-2xl font-semibold text-foreground">{recommendation.primary_action.title}</p>
      <p className="text-sm leading-6 text-muted-foreground">
        Expected to lower tomorrow&apos;s score by about {recommendation.predicted_score_delta} points and {recommendation.risk_reduction_summary.charAt(0).toLowerCase() + recommendation.risk_reduction_summary.slice(1)}
      </p>
      <div className="rounded-xl border border-border/70 bg-background/90 p-4">
        <p className="font-medium text-foreground">{recommendation.why_this_action}</p>
        <p className="mt-2 text-sm text-muted-foreground">{recommendation.why_now}</p>
      </div>
      {recommendation.fallback_action && (
        <div className="rounded-lg border border-dashed border-border p-3">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">If that&apos;s not possible</div>
          <div className="mt-2 font-medium text-foreground">{recommendation.fallback_action.title}</div>
        </div>
      )}
      <RecommendationFeedback
        recommendedActionKey={primaryKey}
        feedbackSubmittedForToday={feedbackSubmittedForToday}
      />
      <RecommendationCommitmentPanel
        recommendation={recommendation}
        activeCommitment={activeCommitment}
        onCommit={onCommitRecommendation}
        onComplete={onCompleteCommitment}
        onSkip={onSkipCommitment}
      />
    </section>
  );
}