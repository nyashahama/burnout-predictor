"use client";

import { useEffect, useState } from "react";
import { scoreColor, scoreLabel, detectPatterns, stressToScore, type HistoryDay } from "@/app/dashboard/data";

// ── Real data builders ─────────────────────────────────────────────────────────

function buildWeekData(weeksAgo: 0 | 1): { days: HistoryDay[]; notes: Record<string, string> } {
  const role  = localStorage.getItem("overload-role")  || "engineer";
  const sleep = localStorage.getItem("overload-sleep") || "8";
  const now   = new Date();
  const days: HistoryDay[]      = [];
  const notes: Record<string, string> = {};
  const offset = weeksAgo * 7;

  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i - offset);
    const key     = `checkin-${d.toISOString().split("T")[0]}`;
    const dateStr = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const raw     = localStorage.getItem(key);

    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        const score  = stressToScore(parsed.stress, role, sleep);
        days.push({ date: dateStr, score });
        if (parsed.note) notes[dateStr] = parsed.note;
      } catch {
        days.push({ date: dateStr, score: 0, ghost: true });
      }
    } else {
      days.push({ date: dateStr, score: 0, ghost: true });
    }
  }
  return { days, notes };
}

function getThisWeekCheckInCount(): number {
  let count = 0;
  const now = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    if (localStorage.getItem(`checkin-${d.toISOString().split("T")[0]}`)) count++;
  }
  return count;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function avg(arr: number[]): number {
  if (!arr.length) return 0;
  return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
}

function buildNarrative(
  thisAvg: number,
  trend: number,
  highStrainDays: number,
  inZoneDays: number,
  peak: number,
  peakDate: string,
  realCount: number,
): string {
  if (realCount < 3) {
    return "Not enough check-ins to read the week yet. A few more days and the picture comes into focus.";
  }

  if (thisAvg > 65) {
    if (highStrainDays >= 5)
      return `A brutal week. You averaged ${thisAvg} — five days in the danger zone. Your nervous system didn't get a break between the hard pushes. This week needs to look different.`;
    return `A hard week. You averaged ${thisAvg}, with ${highStrainDays} days in the danger zone. ${peakDate} was the peak at ${peak}. Each hard day made the next one harder.`;
  }

  if (highStrainDays >= 2 && inZoneDays >= 2) {
    return `A week of contrast — ${highStrainDays} hard days and ${inZoneDays} genuinely good ones. When the space came, you recovered. The work now is making the hard days less frequent.`;
  }

  if (inZoneDays >= 5) {
    return `A strong week. ${inZoneDays} days out of 7 below the threshold. That doesn't happen by accident — you protected something, and it showed.`;
  }

  if (trend > 8) {
    return `A heavier week than the one before — load up ${trend} points on average. Two weeks climbing is a signal, not noise. Address it before it becomes the baseline.`;
  }

  if (trend < -6) {
    return `A lighter week than the one before. You dropped ${Math.abs(trend)} points on average — that's real recovery. Something changed and it's showing in the numbers.`;
  }

  return `A moderate week. ${highStrainDays > 0 ? `${highStrainDays} hard day${highStrainDays > 1 ? "s" : ""}` : "No high-strain days"}, ${inZoneDays > 0 ? `${inZoneDays} in the green` : "no days fully in the green"}. Manageable, not effortless.`;
}

function getOneThingRec(thisAvg: number, trend: number, highStrainDays: number, inZoneDays: number): string {
  if (thisAvg > 65) {
    return "Cap meetings at four per day this week. One hard calendar constraint will do more than ten coping tactics.";
  }
  if (highStrainDays >= 3) {
    return `${highStrainDays} high-strain days is above what you can sustain. Look at what drove them — a recurring meeting, late nights, context-switching — and remove one of those triggers this week.`;
  }
  if (trend > 8) {
    return "One strategic schedule change this week — a blocked morning, a recurring sync converted to async — will outperform everything else you could try.";
  }
  if (inZoneDays >= 5) {
    return "Identify the two or three habits that kept you in the green and treat them as non-negotiable. Name them specifically. Then protect them next week too.";
  }
  if (thisAvg < 40) {
    return "A genuinely good week. The priority is protecting what made it work — name the habits, repeat them.";
  }
  return "Watch whether your hard days cluster or stay isolated. If they cluster, the calendar needs restructuring. If isolated, your recovery is working — keep at it.";
}

// ── Mini Bar ──────────────────────────────────────────────────────────────────

function MiniBar({
  score,
  label,
  isToday,
  isGhost,
  delayMs,
}: {
  score: number;
  label: string;
  isToday: boolean;
  isGhost: boolean;
  delayMs: number;
}) {
  const color = isGhost ? "var(--paper-3)" : scoreColor(score);
  return (
    <div className="weekly-mini-col">
      {!isGhost && (
        <div className="weekly-mini-score" style={{ color }}>{score}</div>
      )}
      {isGhost && <div className="weekly-mini-score" style={{ color: "var(--muted-2)" }}>–</div>}
      <div className="weekly-mini-bar-wrap">
        <div
          className={`weekly-mini-bar${isToday ? " weekly-mini-bar--today" : ""}${isGhost ? " weekly-mini-bar--ghost" : ""}`}
          style={{
            height: isGhost ? "20%" : `${score}%`,
            background: color,
            ["--bar-delay" as string]: `${delayMs}ms`,
          } as React.CSSProperties}
        />
      </div>
      <div className={`weekly-mini-label${isToday ? " weekly-mini-label--today" : ""}`}>
        {label}
      </div>
    </div>
  );
}

// ── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: "ok" | "warning" | "danger";
}) {
  return (
    <div className="weekly-stat">
      <div className="weekly-stat-label">{label}</div>
      <div
        className="weekly-stat-value"
        style={
          accent === "danger"  ? { color: "var(--red)"   } :
          accent === "ok"      ? { color: "var(--green)" } :
          accent === "warning" ? { color: "var(--amber)" } :
          undefined
        }
      >
        {value}
      </div>
      {sub && <div className="weekly-stat-sub">{sub}</div>}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function WeeklyPage() {
  const [thisWeekData, setThisWeekData] = useState<{ days: HistoryDay[]; notes: Record<string, string> }>({ days: [], notes: {} });
  const [lastWeekData, setLastWeekData] = useState<{ days: HistoryDay[]; notes: Record<string, string> }>({ days: [], notes: {} });
  const [thisWeekCheckins, setThisWeekCheckins] = useState(0);

  useEffect(() => {
    setThisWeekData(buildWeekData(0));
    setLastWeekData(buildWeekData(1));
    setThisWeekCheckins(getThisWeekCheckInCount());
  }, []);

  const thisReal = thisWeekData.days.filter((d) => !d.ghost);
  const lastReal = lastWeekData.days.filter((d) => !d.ghost);

  const thisAvg        = avg(thisReal.map((d) => d.score));
  const lastAvg        = avg(lastReal.map((d) => d.score));
  const trend          = thisReal.length && lastReal.length ? thisAvg - lastAvg : 0;

  const peak    = thisReal.length ? Math.max(...thisReal.map((d) => d.score)) : 0;
  const low     = thisReal.length ? Math.min(...thisReal.map((d) => d.score)) : 0;
  const peakDay = thisReal.find((d) => d.score === peak);
  const lowDay  = thisReal.find((d) => d.score === low);

  const highStrainDays = thisReal.filter((d) => d.score > 65).length;
  const inZoneDays     = thisReal.filter((d) => d.score <= 40).length;

  // Peak day note — pulled from real check-in
  const peakNote = peakDay ? thisWeekData.notes[peakDay.date] : null;

  const patterns = thisReal.length >= 7
    ? detectPatterns([...lastReal, ...thisReal])
    : [];

  const narrative = buildNarrative(thisAvg, trend, highStrainDays, inZoneDays, peak, peakDay?.date ?? "", thisReal.length);
  const rec       = getOneThingRec(thisAvg, trend, highStrainDays, inZoneDays);

  const trendLevel: "ok" | "warning" | "danger" =
    trend > 8 ? "danger" : trend > 3 ? "warning" : trend < -3 ? "ok" : "warning";

  // Day labels for the chart
  const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const now       = new Date();
  const chartDays = thisWeekData.days.map((d, i) => {
    const offset = thisWeekData.days.length - 1 - i;
    const date   = new Date(now);
    date.setDate(date.getDate() - offset);
    return {
      ...d,
      dayLabel: i === thisWeekData.days.length - 1 ? "Today" : DAY_SHORT[date.getDay()],
      isToday:  i === thisWeekData.days.length - 1,
    };
  });

  const levelClass = thisAvg > 65 ? "danger" : thisAvg > 40 ? "warning" : "ok";

  return (
    <div className="dash-content">
      <header className="dash-header">
        <h1 className="dash-greeting">Last 7 days</h1>
        <p className="dash-subheading">
          {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
        </p>
      </header>

      {/* ── Narrative — leads the page ── */}
      <div className={`dash-card weekly-narrative-card weekly-narrative-card--${levelClass}`}>
        <p className="weekly-narrative">{narrative}</p>
      </div>

      {/* ── Stats row ── */}
      {thisReal.length > 0 && (
        <div className="weekly-stats-row">
          <StatCard
            label="Avg load"
            value={thisAvg}
            sub={lastReal.length ? (trend !== 0 ? `${trend > 0 ? "+" : ""}${trend} vs last week` : "Same as last week") : undefined}
            accent={trendLevel}
          />
          <StatCard
            label="Hardest day"
            value={peak}
            sub={peakDay?.date}
            accent={peak > 65 ? "danger" : peak > 40 ? "warning" : "ok"}
          />
          <StatCard
            label="Best day"
            value={low}
            sub={lowDay?.date}
            accent={low <= 40 ? "ok" : "warning"}
          />
          <StatCard
            label="High-strain days"
            value={highStrainDays}
            sub={`${inZoneDays} day${inZoneDays !== 1 ? "s" : ""} in the green`}
            accent={highStrainDays >= 3 ? "danger" : highStrainDays >= 1 ? "warning" : "ok"}
          />
          <StatCard
            label="Check-ins"
            value={`${thisWeekCheckins}/7`}
            sub={thisWeekCheckins >= 5 ? "Strong consistency" : thisWeekCheckins >= 3 ? "Keep going" : "More data, sharper picture"}
            accent={thisWeekCheckins >= 5 ? "ok" : thisWeekCheckins >= 3 ? "warning" : "danger"}
          />
        </div>
      )}

      {/* ── 7-day chart ── */}
      {thisWeekData.days.length > 0 && (
        <div className="dash-card weekly-chart-card">
          <div className="weekly-chart-header">
            <div className="weekly-chart-title">This week</div>
            {lastReal.length > 0 && (
              <div className="weekly-chart-legend">
                <span className="weekly-legend-dot" style={{ background: "var(--ink-2)" }} />
                <span>Last week avg: {lastAvg}</span>
              </div>
            )}
          </div>

          <div className="weekly-chart-area">
            {lastReal.length > 0 && (
              <div
                className="weekly-avg-line"
                style={{ bottom: `${lastAvg}%` }}
                title={`Last week avg: ${lastAvg}`}
              />
            )}
            <div className="weekly-mini-bars">
              {chartDays.map((d, i) => (
                <MiniBar
                  key={i}
                  score={d.score}
                  label={d.dayLabel}
                  isToday={d.isToday}
                  isGhost={!!d.ghost}
                  delayMs={i * 50}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── What drove your hardest day ── */}
      {peakDay && peak > 65 && (
        <div className="dash-card weekly-peak-card">
          <div className="weekly-peak-label">What drove {peakDay.date}</div>
          {peakNote ? (
            <blockquote className="weekly-peak-quote">&ldquo;{peakNote}&rdquo;</blockquote>
          ) : (
            <p className="weekly-peak-no-note">
              No note logged for {peakDay.date}. Next time you have a hard day, jot one line — it makes the debrief sharper.
            </p>
          )}
        </div>
      )}

      {/* ── Patterns ── */}
      {patterns.length > 0 && (
        <div className="dash-card weekly-patterns-card">
          <div className="weekly-section-title">What the data says</div>
          <div className="weekly-patterns">
            {patterns.map((p, i) => (
              <div key={i} className="weekly-pattern-item">
                <span className="weekly-pattern-icon">◈</span>
                <span>{p}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Week-over-week comparison ── */}
      {thisReal.length > 0 && lastReal.length > 0 && (
        <div className="dash-card weekly-compare-card">
          <div className="weekly-section-title">Week over week</div>
          <div className="weekly-compare-row">
            <div className="weekly-compare-week">
              <div className="weekly-compare-label">Last week</div>
              <div className="weekly-compare-score" style={{ color: scoreColor(lastAvg) }}>{lastAvg}</div>
              <div className="weekly-compare-badge" style={{ color: scoreColor(lastAvg) }}>{scoreLabel(lastAvg)}</div>
            </div>

            <div className="weekly-compare-arrow">
              <span className="weekly-compare-delta" style={{ color: trend > 0 ? "var(--red)" : "var(--green)" }}>
                {trend > 0 ? "↑" : "↓"} {Math.abs(trend)} pts
              </span>
            </div>

            <div className="weekly-compare-week">
              <div className="weekly-compare-label">This week</div>
              <div className="weekly-compare-score" style={{ color: scoreColor(thisAvg) }}>{thisAvg}</div>
              <div className="weekly-compare-badge" style={{ color: scoreColor(thisAvg) }}>{scoreLabel(thisAvg)}</div>
            </div>
          </div>
        </div>
      )}

      {/* ── The one thing ── */}
      {thisReal.length >= 3 && (
        <div className={`dash-card weekly-rec-card weekly-rec-card--${levelClass}`}>
          <div className="weekly-rec-label">The one thing</div>
          <p className="weekly-rec-text">{rec}</p>
        </div>
      )}
    </div>
  );
}
