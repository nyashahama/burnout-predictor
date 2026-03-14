"use client";

import { useEffect, useState } from "react";

function countGapDays(): number {
  const now = new Date();
  for (let i = 1; i <= 90; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    if (localStorage.getItem(`checkin-${d.toISOString().split("T")[0]}`)) return i - 1;
  }
  return 0;
}

function getGapMessage(gapDays: number): string {
  if (gapDays >= 14)
    return `It's been ${gapDays} days. The app still remembers what it knew about you. Pick up from here — no catch-up required.`;
  if (gapDays >= 7)
    return `${gapDays} days away. Welcome back. Gaps are data too — something interrupted the habit. Today is day one again.`;
  if (gapDays >= 4)
    return `Four days away. Something disrupted the habit — and that's worth noticing. The app is still here. Pick up from where you left off.`;
  return `You haven't checked in for ${gapDays} days. Welcome back — no pressure, just pick up from here.`;
}

export default function GapReturn({ hasCheckedIn }: { hasCheckedIn: boolean }) {
  const [gapDays, setGapDays] = useState(0);

  useEffect(() => {
    if (!hasCheckedIn) {
      setGapDays(countGapDays());
    }
  }, [hasCheckedIn]);

  if (hasCheckedIn || gapDays < 2) return null;

  return (
    <div className="gap-return">
      <p className="gap-return-text">{getGapMessage(gapDays)}</p>
    </div>
  );
}
