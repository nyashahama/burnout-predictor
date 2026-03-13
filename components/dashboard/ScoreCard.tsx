import { scoreColor } from "@/app/dashboard/data";

type Signal = {
  label: string;
  detail: string;
  val: string;
  level: "ok" | "warning" | "danger";
};

type ScoreCardData = {
  score: number;
  statusLabel: string;
  level: "ok" | "warning" | "danger";
  signals: Signal[];
  suggestion: string;
};

export default function ScoreCard({ data }: { data: ScoreCardData }) {
  const color = scoreColor(data.score);

  return (
    <div className="dash-card scorecard">
      <div className="scorecard-header">
        <div className="scorecard-label">Cognitive load score</div>
        <div className={`scorecard-badge scorecard-badge--${data.level}`}>
          {data.level === "danger" ? "⚠ " : data.level === "warning" ? "◑ " : "✓ "}
          {data.statusLabel}
        </div>
      </div>

      <div className="scorecard-score-row">
        <div className="scorecard-number" style={{ color }}>
          {data.score}
        </div>
        <div className="scorecard-of">/ 100</div>
      </div>

      <div className="scorecard-signals">
        {data.signals.map((s, i) => (
          <div key={i} className="scorecard-signal">
            <div className={`signal-dot signal-dot--${s.level}`} />
            <div className="signal-body">
              <div className="signal-label">{s.label}</div>
              <div className="signal-detail">{s.detail}</div>
            </div>
            <div className={`signal-val signal-val--${s.level}`}>{s.val}</div>
          </div>
        ))}
      </div>

      <div className={`scorecard-suggestion scorecard-suggestion--${data.level}`}>
        <div className={`suggestion-label suggestion-label--${data.level}`}>Today&apos;s recommendation</div>
        <p className="suggestion-text">{data.suggestion}</p>
      </div>
    </div>
  );
}
