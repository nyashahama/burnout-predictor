import { ForecastDay, scoreColor } from "@/app/dashboard/data";

export default function ForecastChart({ data }: { data: ForecastDay[] }) {
  return (
    <div className="dash-card forecast">
      <div className="forecast-header">
        <div className="forecast-title">7-day forecast</div>
        <div className="forecast-sub">Predicted cognitive load</div>
      </div>

      <div className="forecast-chart">
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
            <div className="forecast-bar-wrap">
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

      <div className="forecast-legend">
        <div className="forecast-legend-item">
          <span
            className="forecast-legend-dot"
            style={{ background: "var(--green)" }}
          />
          <span>In zone</span>
        </div>
        <div className="forecast-legend-item">
          <span
            className="forecast-legend-dot"
            style={{ background: "var(--amber)" }}
          />
          <span>Moderate</span>
        </div>
        <div className="forecast-legend-item">
          <span
            className="forecast-legend-dot"
            style={{ background: "var(--red)" }}
          />
          <span>High strain</span>
        </div>
      </div>
    </div>
  );
}
