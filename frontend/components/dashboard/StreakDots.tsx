"use client";

interface StreakDotsProps {
  streak: number;
  checkins: { checked_in_date: string }[];
}

export default function StreakDots({ streak, checkins }: StreakDotsProps) {
  const recent = checkins.slice(0, 7);
  const recentDates = new Set(recent.map((c) => c.checked_in_date));

  const today = new Date();
  const dots: ("filled" | "empty")[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (6 - i));
    const key = d.toISOString().slice(0, 10);
    return recentDates.has(key) ? "filled" : "empty";
  });

  return (
    <div className="flex items-center gap-3">
      <div className="text-2xl font-semibold">{streak}</div>
      <div>
        <div className="text-xs text-muted-foreground">Day streak</div>
        <div className="flex gap-1 mt-1">
          {dots.map((state, i) => (
            <div
              key={i}
              className={`w-2.5 h-2.5 rounded-full ${state === "filled" ? "bg-primary" : "bg-muted"}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}