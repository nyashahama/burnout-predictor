"use client";

import { useAuth } from "@/contexts/AuthContext";
import type { InsightBundle } from "@/lib/types";

interface Props {
  bundle: InsightBundle | null;
}

export default function PersonalizedInsight({ bundle }: Props) {
  const { api } = useAuth();

  async function dismiss(componentKey: string) {
    try {
      await api.post("/api/insights/dismiss", { component_key: componentKey });
    } catch (e) {
      console.error("Dismiss failed:", e);
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

  return (
    <div className="dash-card personalized-insight">
      <div className="pi-label">What your data says</div>

      {session_context && !dismissed.has("session_context") && (
        <div className="pi-section pi-session-context">
          <p className="pi-text">{session_context.Message}</p>
          <button className="pi-dismiss" onClick={() => dismiss("session_context")}>
            Dismiss
          </button>
        </div>
      )}

      {patterns && patterns.length > 0 && !dismissed.has("patterns") && (
        <div className="pi-section pi-patterns">
          <ul className="pi-pattern-list">
            {patterns.map((p, i) => (
              <li key={i} className="pi-pattern-item">{p}</li>
            ))}
          </ul>
          <button className="pi-dismiss" onClick={() => dismiss("patterns")}>
            Dismiss
          </button>
        </div>
      )}

      {arc_narrative && !dismissed.has("arc_narrative") && (
        <div className="pi-section pi-arc">
          <p className="pi-text">{arc_narrative}</p>
          <button className="pi-dismiss" onClick={() => dismiss("arc_narrative")}>
            Dismiss
          </button>
        </div>
      )}

      {signature_narrative && !dismissed.has("signature_narrative") && (
        <div className="pi-section pi-signature">
          <p className="pi-text">{signature_narrative}</p>
          <button className="pi-dismiss" onClick={() => dismiss("signature_narrative")}>
            Dismiss
          </button>
        </div>
      )}

      {monthly_arc?.Message && !dismissed.has("monthly_arc") && (
        <div className="pi-section pi-monthly-arc">
          <p className="pi-text">{monthly_arc.Message}</p>
          <button className="pi-dismiss" onClick={() => dismiss("monthly_arc")}>
            Dismiss
          </button>
        </div>
      )}

      {what_works && !dismissed.has("what_works") && (
        <div className="pi-section pi-what-works">
          <p className="pi-text">{what_works}</p>
          <button className="pi-dismiss" onClick={() => dismiss("what_works")}>
            Dismiss
          </button>
        </div>
      )}

      {milestone && !dismissed.has("milestone") && (
        <div className="pi-section pi-milestone">
          <p className="pi-text pi-milestone-num">{milestone.Milestone}</p>
          <button className="pi-dismiss" onClick={() => dismiss("milestone")}>
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
