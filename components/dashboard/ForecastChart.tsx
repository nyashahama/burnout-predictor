"use client";

import { useState } from "react";
import { ForecastDay, scoreColor, scoreLabel } from "@/app/dashboard/data";

const BAR_H = 120;
const THRESHOLD = 65;
const thresholdTopPct = (1 - THRESHOLD / 100) * 100; // 35%

export default function ForecastChart({ data }: { data: ForecastDay[] }) {
  const [hovered, setHovered] = useState<number | null>(null);

  const dangerDays   = data.filter((d) => d.score > 65).length;
  const firstRecovery = data.find((d) => d.score <= 40);

  return (
    <div className="dash-card forecast">
      <div className="forecast-header">
        <div className="forecast-title">7-day forecast</div>
        <div className="forecast-sub">
          {dangerDays > 0
            ? `${dangerDays} high-strain ${dangerDays === 1 ? "day" : "days"} ahead — recovery ${
                firstRecovery ? `from ${firstRecovery.date}` : "needs action"
              }`
            : "Load trending down — you're in recovery"}
        </div>
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
            // Pin tooltip left/right for edge bars so it doesn't overflow the card
            const tooltipAlign =
              i === 0 ? "left" : i === data.length - 1 ? "right" : "center";

            return (
              <div
                key={i}
                className={`forecast-col${isToday ? " forecast-col--today" : ""}`}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
              >
                {/* Hover tooltip */}
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

                {/* Score number above bar — hidden while tooltip shows */}
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

                {/* Bar */}
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
