"use client";

import { useEffect, useState } from "react";

type ArcMessage = { headline: string; body: string; noteHint: boolean };

function buildEarlyArcMessage(checkinCount: number): ArcMessage {
  const now = new Date();
  const daysLeft = 7 - checkinCount;

  // Read recent stresses
  const recentStresses: number[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const raw = localStorage.getItem(`checkin-${d.toISOString().split("T")[0]}`);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed.stress === "number") recentStresses.push(parsed.stress);
    } catch {}
  }

  const elevatedCount = recentStresses.filter((s) => s >= 4).length;
  const calmCount     = recentStresses.filter((s) => s <= 2).length;
  const allElevated   = elevatedCount === recentStresses.length && recentStresses.length >= 2;
  const allCalm       = calmCount     === recentStresses.length && recentStresses.length >= 2;

  if (checkinCount === 1) {
    return {
      headline: "Day 1. The app is listening.",
      body: "Come back tomorrow — one check-in is a start, seven is where the picture forms.",
      noteHint: true,
    };
  }

  if (checkinCount === 2) {
    if (allElevated) return {
      headline: "Two check-ins. Both elevated.",
      body: `The app is tracking the direction. ${daysLeft} more days and it will know whether this is your baseline or a rough patch.`,
      noteHint: true,
    };
    if (allCalm) return {
      headline: "Two check-ins. Both calm.",
      body: `Strong start. ${daysLeft} more days and the app will know what's keeping you here.`,
      noteHint: true,
    };
    return {
      headline: "Two check-ins in.",
      body: `Already seeing some variation. ${daysLeft} more days and the first real pattern surfaces.`,
      noteHint: true,
    };
  }

  if (checkinCount === 3) {
    if (allElevated) return {
      headline: "Three days running elevated.",
      body: "The app has enough to say this isn't random. Four more check-ins and it will know whether this is a pattern or a rough stretch.",
      noteHint: false,
    };
    return {
      headline: `Day 3. The picture is forming.`,
      body: `${elevatedCount > 0 ? `${elevatedCount} elevated day${elevatedCount > 1 ? "s" : ""} out of ${checkinCount} so far. ` : ""}${daysLeft} more check-ins to the first pattern read.`,
      noteHint: false,
    };
  }

  // Days 4–6
  if (allElevated) return {
    headline: `${checkinCount} elevated days straight.`,
    body: `The app is tracking this. ${daysLeft} more day${daysLeft !== 1 ? "s" : ""} to the first pattern read — but it's already seeing a direction.`,
    noteHint: false,
  };

  return {
    headline: `${daysLeft} day${daysLeft !== 1 ? "s" : ""} to the first pattern read.`,
    body: `${elevatedCount} elevated, ${calmCount} calm out of ${checkinCount} check-ins so far. The app is calibrating. Keep going.`,
    noteHint: false,
  };
}

export default function EarlyArc({ checkinCount }: { checkinCount: number }) {
  const [message, setMessage] = useState<ArcMessage | null>(null);

  useEffect(() => {
    if (checkinCount >= 1 && checkinCount < 7) {
      setMessage(buildEarlyArcMessage(checkinCount));
    }
  }, [checkinCount]);

  if (!message) return null;

  return (
    <div className="early-arc">
      <div className="early-arc-headline">{message.headline}</div>
      <p className="early-arc-body">{message.body}</p>
      {message.noteHint && (
        <p className="early-arc-note-hint">
          Notes are what teach the app what your stressors actually are. Even one word makes the data sharper.
        </p>
      )}
      <div className="early-arc-progress">
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className={`early-arc-dot${i < checkinCount ? " early-arc-dot--filled" : ""}`}
          />
        ))}
        <span className="early-arc-progress-label">{checkinCount} / 7</span>
      </div>
    </div>
  );
}
