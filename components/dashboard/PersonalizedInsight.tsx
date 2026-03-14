"use client";

import { useEffect, useState } from "react";
import { findWhatWorksForYou } from "@/app/dashboard/data";

export default function PersonalizedInsight() {
  const [insight, setInsight] = useState<string | null>(null);

  useEffect(() => {
    setInsight(findWhatWorksForYou());
  }, []);

  if (!insight) return null;

  return (
    <div className="dash-card personalized-insight">
      <div className="pi-label">What your data says</div>
      <p className="pi-text">{insight}</p>
    </div>
  );
}
