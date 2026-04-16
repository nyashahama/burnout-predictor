"use client";

import { useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";

interface RecommendationFeedbackProps {
  recommendedActionKey: string;
  feedbackSubmittedForToday: string | null;
}

export default function RecommendationFeedback({
  recommendedActionKey,
  feedbackSubmittedForToday,
}: RecommendationFeedbackProps) {
  const { api } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<string | null>(feedbackSubmittedForToday);

  if (submitted || !recommendedActionKey) {
    return null;
  }

  async function handleFeedback(helpful: boolean) {
    if (submitting) return;
    setSubmitting(true);

    try {
      await api.post("/api/recommendations/feedback", {
        recommended_action_key: recommendedActionKey,
        helpful,
      });
      setSubmitted(helpful ? "helpful" : "not_helpful");
    } catch (err) {
      // Silent failure — don't disrupt the check-in flow
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border/70 bg-background/80 p-4 backdrop-blur-sm">
      <span className="text-sm text-muted-foreground">Was this helpful?</span>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleFeedback(true)}
          disabled={submitting}
          className="gap-2"
        >
          <ThumbsUp className="h-4 w-4" />
          Yes
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleFeedback(false)}
          disabled={submitting}
          className="gap-2"
        >
          <ThumbsDown className="h-4 w-4" />
          No
        </Button>
      </div>
    </div>
  );
}