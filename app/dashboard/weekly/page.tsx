"use client";

import { useEffect, useState } from "react";
import { history, scoreColor, scoreLabel, detectPatterns } from "@/app/dashboard/data";

// ── Helpers ───────────────────────────────────────────────────────────────────

function avg(arr: number[]): number {
  if (!arr.length) return 0;
  return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
}

function getLiveCheckInCount(): number {
  let count = 0;
  for (let i = 0; i < localStorage.length; i++) {
    if (localStorage.key(i)?.startsWith("checkin-")) count++;
  }
  return count;
}

function getThisWeekCheckInCount(): number {
  let count = 0;
  const now = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = `checkin-${d.toISOString().split("T")[0]}`;
    if (localStorage.getItem(key)) count++;
  }
  return count;
}

// ── Mini Bar Chart ────────────────────────────────────────────────────────────

function MiniBar({
  score,
  label,
  isToday,
  delayMs,
}: {
  score: number;
  label: string;
  isToday: boolean;
  delayMs: number;
}) {
  const color = scoreColor(score);
  return (
    <div className="weekly-mini-col">
      <div className="weekly-mini-score" style={{ color }}>{score}</div>
      <div className="weekly-mini-bar-wrap">
        <div
          className={`weekly-mini-bar${isToday ? " weekly-mini-bar--today" : ""}`}
          style={{
            height: `${score}%`,
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
          accent === "danger"
            ? { color: "var(--red)" }
            : accent === "ok"
            ? { color: "var(--green)" }
            : accent === "warning"
            ? { color: "var(--amber)" }
            : undefined
        }
      >
        {value}
      </div>
      {sub && <div className="weekly-stat-sub">{sub}</div>}
    </div>
  );
}

// ── Recommendation ────────────────────────────────────────────────────────────

function getWeeklyRec(avgScore: number, trend: number, highStrainDays: number): string {
  if (avgScore > 65) {
    return "Last week pushed hard. This week: cap meetings at 4 per day, block at least one 2-hour deep-work window daily, and protect Sunday as a full recovery day. The load won't ease itself.";
  }
  if (highStrainDays >= 3) {
    return `${highStrainDays} high-strain days last week is above the healthy threshold. Look at what drove those days — recurring meetings, late nights, or context-switching — and remove one of those triggers this week.`;
  }
  if (trend > 8) {
    return "Your score climbed significantly over the last two weeks. That trajectory matters — address it before it becomes the baseline. One strategic schedule change this week will outperform ten coping tactics later.";
  }
  if (avgScore < 40) {
    return "Strong week. You kept load under control. The priority now is protecting what made it work — identify the habits that kept you in the green and deliberately repeat them.";
  }
  return "A moderate week overall. The pattern to watch: are your high-strain days isolated or clustering? If they cluster, the calendar needs restructuring. If isolated, your recovery mechanisms are working.";
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function WeeklyPage() {
  const [checkinCount, setCheckinCount]       = useState(0);
  const [thisWeekCheckins, setThisWeekCheckins] = useState(0);

  useEffect(() => {
    setCheckinCount(getLiveCheckInCount());
    setThisWeekCheckins(getThisWeekCheckInCount());
  }, []);

  // Last 7 days of history (most recent = last entry)
  const thisWeek = history.slice(-7);
  const lastWeek = history.slice(-14, -7);

  const thisAvg = avg(thisWeek.map((d) => d.score));
  const lastAvg = avg(lastWeek.map((d) => d.score));
  const trend   = thisAvg - lastAvg;

  const peak = Math.max(...thisWeek.map((d) => d.score));
  const low  = Math.min(...thisWeek.map((d) => d.score));
  const peakDay = thisWeek.find((d) => d.score === peak);
  const lowDay  = thisWeek.find((d) => d.score === low);

  const highStrainDays = thisWeek.filter((d) => d.score > 65).length;
  const inZoneDays     = thisWeek.filter((d) => d.score <= 40).length;

  const patterns = detectPatterns(history);
  const rec = getWeeklyRec(thisAvg, trend, highStrainDays);

  // Day labels for the chart: Mon–Sun style
  const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const today = new Date();
  const chartDays = thisWeek.map((d, i) => {
    const offset = thisWeek.length - 1 - i;
    const date = new Date(today);
    date.setDate(date.getDate() - offset);
    return {
      ...d,
      dayLabel: i === thisWeek.length - 1 ? "Today" : DAY_SHORT[date.getDay()],
      isToday: i === thisWeek.length - 1,
    };
  });

  const trendLevel: "ok" | "warning" | "danger" =
    trend > 8 ? "danger" : trend > 3 ? "warning" : trend < -3 ? "ok" : "warning";

  return (
    <div className="dash-content">
      <header className="dash-header">
        <h1 className="dash-greeting">Weekly summary</h1>
        <p className="dash-subheading">
          {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} — your last 7 days at a glance
        </p>
      </header>

      {/* ── Stats row ── */}
      <div className="weekly-stats-row">
        <StatCard
          label="Avg load"
          value={thisAvg}
          sub={trend !== 0 ? `${trend > 0 ? "+" : ""}${trend} vs prev week` : "Same as prev week"}
          accent={trendLevel}
        />
        <StatCard
          label="Peak day"
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
          sub={thisWeekCheckins >= 5 ? "Great consistency" : thisWeekCheckins >= 3 ? "Keep it up" : "More data = better score"}
          accent={thisWeekCheckins >= 5 ? "ok" : thisWeekCheckins >= 3 ? "warning" : "danger"}
        />
      </div>

      {/* ── 7-day mini chart ── */}
      <div className="dash-card weekly-chart-card">
        <div className="weekly-chart-header">
          <div className="weekly-chart-title">This week vs last week</div>
          <div className="weekly-chart-legend">
            <span className="weekly-legend-dot" style={{ background: "var(--ink-2)" }} />
            <span>Last week avg: {lastAvg}</span>
          </div>
        </div>

        <div className="weekly-chart-area">
          {/* Last week avg line */}
          <div
            className="weekly-avg-line"
            style={{ bottom: `${lastAvg}%` }}
            title={`Last week avg: ${lastAvg}`}
          />

          <div className="weekly-mini-bars">
            {chartDays.map((d, i) => (
              <MiniBar
                key={i}
                score={d.score}
                label={d.dayLabel}
                isToday={d.isToday}
                delayMs={i * 50}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ── Patterns ── */}
      {patterns.length > 0 && (
        <div className="dash-card weekly-patterns-card">
          <div className="weekly-section-title">Patterns detected</div>
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
      <div className="dash-card weekly-compare-card">
        <div className="weekly-section-title">Week over week</div>
        <div className="weekly-compare-row">
          <div className="weekly-compare-week">
            <div className="weekly-compare-label">Last week</div>
            <div className="weekly-compare-score" style={{ color: scoreColor(lastAvg) }}>
              {lastAvg}
            </div>
            <div className="weekly-compare-badge" style={{ color: scoreColor(lastAvg) }}>
              {scoreLabel(lastAvg)}
            </div>
          </div>

          <div className="weekly-compare-arrow">
            <span
              className="weekly-compare-delta"
              style={{ color: trend > 0 ? "var(--red)" : "var(--green)" }}
            >
              {trend > 0 ? "↑" : "↓"} {Math.abs(trend)} pts
            </span>
          </div>

          <div className="weekly-compare-week">
            <div className="weekly-compare-label">This week</div>
            <div className="weekly-compare-score" style={{ color: scoreColor(thisAvg) }}>
              {thisAvg}
            </div>
            <div className="weekly-compare-badge" style={{ color: scoreColor(thisAvg) }}>
              {scoreLabel(thisAvg)}
            </div>
          </div>
        </div>
      </div>

      {/* ── Recommendation ── */}
      <div className={`dash-card weekly-rec-card weekly-rec-card--${thisAvg > 65 ? "danger" : thisAvg > 40 ? "warning" : "ok"}`}>
        <div className="weekly-rec-label">This week&apos;s recommendation</div>
        <p className="weekly-rec-text">{rec}</p>
      </div>
    </div>
  );
}
