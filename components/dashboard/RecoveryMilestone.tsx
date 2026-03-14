"use client";

import { useEffect, useState } from "react";
import { detectRecoveryMilestone } from "@/app/dashboard/data";

export default function RecoveryMilestone() {
  const [milestone, setMilestone] = useState<{ type: string; message: string } | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setMilestone(detectRecoveryMilestone());
  }, []);

  if (!milestone || dismissed) return null;

  return (
    <div className="recovery-milestone">
      <span className="recovery-milestone-icon">✦</span>
      <p className="recovery-milestone-text">{milestone.message}</p>
      <button
        className="recovery-milestone-dismiss"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
