"use client";

import { useState } from "react";
import { HistoryDay, scoreColor, scoreLabel } from "@/app/dashboard/data";

export default function HistoryChart({ data }: { data: HistoryDay[] }) {
  const [tooltip, setTooltip] = useState<{
    index: number;
    day: HistoryDay;
  } | null>(null);

  return (
    <div className="dash-card history">
      <div className="history-header">
        <div className="history-title">30-day history</div>
        <div className="history-sub">
          Your cognitive load over the past month
        </div>
      </div>

      <div className="history-chart">
        {data.map((d, i) => (
          <div
            key={i}
            className="history-col"
            onMouseEnter={() => setTooltip({ index: i, day: d })}
            onMouseLeave={() => setTooltip(null)}
          >
            {tooltip?.index === i && (
              <div className="history-tooltip">
                <div className="history-tooltip-date">{d.date}</div>
                <div
                  className="history-tooltip-score"
                  style={{ color: scoreColor(d.score) }}
                >
                  {d.score}
                </div>
                <div className="history-tooltip-label">
                  {scoreLabel(d.score)}
                </div>
              </div>
            )}
            <div className="history-bar-wrap">
              <div
                className={`history-bar${i === data.length - 1 ? " history-bar--today" : ""}`}
                style={{
                  height: `${d.score}%`,
                  background: scoreColor(d.score),
                  opacity: i === data.length - 1 ? 1 : 0.65,
                }}
              />
            </div>
            <div
              className={`history-date${i % 7 === 0 || i === data.length - 1 ? "" : " history-date--hidden"}`}
            >
              {d.date}
            </div>
          </div>
        ))}
      </div>

      <div className="history-legend">
        <div className="history-legend-item">
          <span
            className="history-legend-dot"
            style={{ background: "var(--green)" }}
          />
          <span>In your zone (&lt;40)</span>
        </div>
        <div className="history-legend-item">
          <span
            className="history-legend-dot"
            style={{ background: "var(--amber)" }}
          />
          <span>Moderate (40–65)</span>
        </div>
        <div className="history-legend-item">
          <span
            className="history-legend-dot"
            style={{ background: "var(--red)" }}
          />
          <span>High strain (&gt;65)</span>
        </div>
      </div>
    </div>
  );
}
