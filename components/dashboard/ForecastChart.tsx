import { ForecastDay, scoreColor } from "@/app/dashboard/data";

const BAR_H = 120; // px — height of the bar area only
const THRESHOLD = 65;
// Threshold line: from top, the danger zone starts at (1 - 65/100) = 35% of BAR_H
const thresholdTopPct = (1 - THRESHOLD / 100) * 100; // 35%

export default function ForecastChart({ data }: { data: ForecastDay[] }) {
  const dangerDays = data.filter((d) => d.score > 65).length;
  const firstRecovery = data.find((d) => d.score <= 40);

  return (
    <div className="dash-card forecast">
      <div className="forecast-header">
        <div className="forecast-title">7-day forecast</div>
        <div className="forecast-sub">
          {dangerDays > 0
            ? `${dangerDays} high-strain ${dangerDays === 1 ? "day" : "days"} ahead — recovery ${firstRecovery ? `from ${firstRecovery.date}` : "needs action"}`
            : "Load trending down — you're in recovery"}
        </div>
      </div>

      {/* Bar chart with threshold line */}
      <div className="forecast-chart-wrap">
        {/* Danger zone shading + threshold line */}
        <div
          className="forecast-danger-zone"
          style={{ height: `${thresholdTopPct}%` }}
        >
          <span className="forecast-zone-label">Danger zone</span>
        </div>

        <div className="forecast-bars">
          {data.map((d, i) => (
            <div
              key={i}
              className={`forecast-col${i === 0 ? " forecast-col--today" : ""}`}
            >
              <div
                className="forecast-score"
                style={{ color: scoreColor(d.score) }}
              >
                {d.score}
              </div>
              <div className="forecast-bar-wrap" style={{ height: BAR_H }}>
                <div
                  className="forecast-bar"
                  style={{
                    height: `${d.score}%`,
                    background: scoreColor(d.score),
                  }}
                />
              </div>
              <div className="forecast-day">{d.day}</div>
              <div className="forecast-date">{d.date}</div>
            </div>
          ))}
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
