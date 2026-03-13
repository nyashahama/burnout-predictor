import { history, mockCheckIns, scoreColor, scoreLabel } from "../data";
import HistoryChart from "@/components/dashboard/HistoryChart";

const avg = Math.round(history.reduce((s, d) => s + d.score, 0) / history.length);
const highStrainDays = history.filter((d) => d.score > 65).length;
const inZoneDays = history.filter((d) => d.score <= 40).length;
const peakScore = Math.max(...history.map((d) => d.score));

function levelClass(score: number) {
  if (score > 65) return "danger";
  if (score > 40) return "warning";
  return "ok";
}

export default function HistoryPage() {
  return (
    <div className="dash-content">
      <header className="dash-header">
        <h1 className="dash-greeting">History</h1>
        <p className="dash-subheading">Your cognitive load over the past 30 days</p>
      </header>

      <div className="hist-stats">
        <div className="hist-stat">
          <div
            className="hist-stat-value"
            style={{ color: scoreColor(avg) }}
          >
            {avg}
          </div>
          <div className="hist-stat-label">Avg score</div>
          <div className="hist-stat-sublabel">{scoreLabel(avg)}</div>
        </div>

        <div className="hist-stat">
          <div className="hist-stat-value" style={{ color: "var(--red)" }}>
            {highStrainDays}
          </div>
          <div className="hist-stat-label">High-strain days</div>
          <div className="hist-stat-sublabel">Score above 65</div>
        </div>

        <div className="hist-stat">
          <div className="hist-stat-value" style={{ color: "var(--green)" }}>
            {inZoneDays}
          </div>
          <div className="hist-stat-label">In-zone days</div>
          <div className="hist-stat-sublabel">Score below 40</div>
        </div>

        <div className="hist-stat">
          <div className="hist-stat-value" style={{ color: scoreColor(peakScore) }}>
            {peakScore}
          </div>
          <div className="hist-stat-label">Peak load</div>
          <div className="hist-stat-sublabel">Highest this month</div>
        </div>
      </div>

      <HistoryChart data={history} />

      <div className="dash-card hist-log">
        <div className="hist-log-header">
          <div>
            <div className="hist-log-title">Check-in log</div>
            <div className="hist-log-count">{mockCheckIns.length} entries this month</div>
          </div>
        </div>

        <div className="hist-log-list">
          {mockCheckIns.map((entry, i) => (
            <div key={i} className="hist-log-row">
              <div className="hist-log-date">{entry.date}</div>

              <div
                className="hist-log-score"
                style={{ color: scoreColor(entry.score) }}
              >
                {entry.score}
              </div>

              <div className={`hist-log-badge hist-log-badge--${levelClass(entry.score)}`}>
                {scoreLabel(entry.score)}
              </div>

              <div className="hist-log-stress">
                <span className="hist-log-stress-num">{entry.stress}</span>
                <span className="hist-log-stress-label">{entry.stressLabel}</span>
              </div>

              {entry.note ? (
                <div className="hist-log-note">{entry.note}</div>
              ) : (
                <div className="hist-log-no-note">—</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
