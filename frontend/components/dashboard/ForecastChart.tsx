"use client";

import { useState } from "react";
import { scoreColor, scoreLabel } from "@/app/dashboard/data";

type ForecastDay = {
  day: string;
  date: string;
  score: number;
  level: "ok" | "warning" | "danger";
};

const BAR_H = 120;
const THRESHOLD = 65;
const thresholdTopPct = (1 - THRESHOLD / 100) * 100; // 35%

/**
 * Generates one sentence that reads the week like a forecast, not a data
 * summary. The goal: tell the user the one thing they need to know about
 * their week before their first meeting.
 */
function buildNarrative(data: ForecastDay[]): string {
  const today       = data[0];
  const rest        = data.slice(1);
  const dangerRest  = rest.filter((d) => d.score > 65);
  const firstEaseIdx = rest.findIndex((d) => d.score < 65);
  const firstEase   = firstEaseIdx >= 0 ? rest[firstEaseIdx] : null;
  const firstRecover = rest.find((d) => d.score <= 40);

  // Today is in the green
  if (today.score <= 40) {
    if (dangerRest.length === 0)
      return "A clean week ahead. Protect the habits that got you here.";
    return `Clear today, but ${dangerRest[0].day} spikes. Don't add anything before then.`;
  }

  // Today is moderate
  if (today.score <= 65) {
    if (dangerRest.length === 0)
      return "Manageable load this week. Keep your focus blocks defended.";
    return `${dangerRest[0].day} is your pressure point this week. Everything else is navigable.`;
  }

  // Today is in danger (> 65)
  if (!firstEase) {
    return "No natural break this week. Something needs to move off your plate — today, not later.";
  }

  if (firstEaseIdx === 0) {
    // Tomorrow it breaks
    return firstRecover
      ? `Tomorrow it lightens — ${firstRecover.day} is full recovery. Hold through today.`
      : "One more hard push today, then it opens. Don't add anything tonight.";
  }

  if (dangerRest.length === 1) {
    // Today + one more danger day, then break
    return firstRecover
      ? `Heavy today and ${dangerRest[0].day}. It breaks ${firstEase.day} — ${firstRecover.day} is full recovery. Protect tonight's sleep.`
      : `Heavy today and ${dangerRest[0].day}, then it eases ${firstEase.day}. Don't push tonight.`;
  }

  // Multiple hard days ahead before any break
  const lastDanger = dangerRest[dangerRest.length - 1];
  return firstRecover
    ? `Pressure holds through ${lastDanger.day}. ${firstRecover.day} is your recovery window — protect sleep every night until then.`
    : `Heavy through ${lastDanger.day}, then it opens. Protect sleep every night until the break.`;
}

export default function ForecastChart({ data }: { data: ForecastDay[] }) {
  const [hovered, setHovered] = useState<number | null>(null);

  const narrative = buildNarrative(data);

  return (
    <div className="dash-card forecast">
      <div className="forecast-header">
        <div className="forecast-title">7-day forecast</div>
        <div className="forecast-narrative">{narrative}</div>
      </div>

      <div className="forecast-chart-wrap">
        {/* Danger zone shading */}
        <div
          className="forecast-danger-zone"
          style={{ height: `${thresholdTopPct}%` }}
        >
          <span className="forecast-zone-label">Danger zone</span>
        </div>

        <div className="forecast-bars">
          {data.map((d, i) => {
            const isToday   = i === 0;
            const isHovered = hovered === i;
            const tooltipAlign =
              i === 0 ? "left" : i === data.length - 1 ? "right" : "center";

            return (
              <div
                key={i}
                className={`forecast-col${isToday ? " forecast-col--today" : ""}`}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
              >
                {isHovered && (
                  <div
                    className={`forecast-tooltip forecast-tooltip--${tooltipAlign}`}
                  >
                    <span className="forecast-tooltip-day">
                      {isToday ? "Today" : d.day}
                    </span>
                    <span className="forecast-tooltip-date">{d.date}</span>
                    <span
                      className="forecast-tooltip-score"
                      style={{ color: scoreColor(d.score) }}
                    >
                      {d.score}
                    </span>
                    <span className="forecast-tooltip-label">
                      {scoreLabel(d.score)}
                    </span>
                  </div>
                )}

                <div
                  className="forecast-score"
                  style={{
                    color: scoreColor(d.score),
                    opacity: isHovered ? 0 : 1,
                    transition: "opacity 0.1s",
                  }}
                >
                  {d.score}
                </div>

                <div className="forecast-bar-wrap" style={{ height: BAR_H }}>
                  <div
                    className="forecast-bar"
                    style={{
                      height: `${d.score}%`,
                      background: scoreColor(d.score),
                      opacity: isHovered || isToday ? 1 : 0.7,
                      ["--bar-delay" as string]: `${i * 60}ms`,
                    } as React.CSSProperties}
                  />
                </div>

                <div className="forecast-day">{d.day}</div>
                <div className="forecast-date">
                  {isToday ? "Today" : d.date}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="forecast-legend">
        <div className="forecast-legend-item">
          <span className="forecast-legend-dot" style={{ background: "var(--green)" }} />
          <span>In zone</span>
        </div>
        <div className="forecast-legend-item">
          <span className="forecast-legend-dot" style={{ background: "var(--amber)" }} />
          <span>Moderate</span>
        </div>
        <div className="forecast-legend-item">
          <span className="forecast-legend-dot" style={{ background: "var(--red)" }} />
          <span>High strain</span>
        </div>
      </div>
    </div>
  );
}
