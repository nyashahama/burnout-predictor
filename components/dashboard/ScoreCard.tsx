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

// SVG gauge constants
const CX = 60, CY = 60, R = 50;
const CIRC = 2 * Math.PI * R; // ≈ 314
const ARC = 0.75 * CIRC;      // 270° arc

function ScoreGauge({ score, color }: { score: number; color: string }) {
  const fill = (score / 100) * ARC;
  return (
    <div className="scorecard-gauge-wrap">
      <svg viewBox="0 0 120 120" className="scorecard-gauge-svg">
        {/* Background track */}
        <circle
          cx={CX} cy={CY} r={R}
          fill="none"
          stroke="var(--paper-3)"
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={`${ARC} ${CIRC}`}
          transform={`rotate(135 ${CX} ${CY})`}
        />
        {/* Score arc */}
        <circle
          cx={CX} cy={CY} r={R}
          fill="none"
          stroke={color}
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={`${fill} ${CIRC}`}
          transform={`rotate(135 ${CX} ${CY})`}
          style={{ transition: "stroke-dasharray 0.6s ease" }}
        />
      </svg>
      {/* Number overlay */}
      <div className="scorecard-gauge-center">
        <div className="scorecard-number" style={{ color }}>{score}</div>
        <div className="scorecard-of">/ 100</div>
      </div>
    </div>
  );
}

export default function ScoreCard({
  data,
  trend,
  dangerStreak,
}: {
  data: ScoreCardData;
  trend: number;
  dangerStreak: number;
}) {
  const color = scoreColor(data.score);
  const trendUp = trend > 0;
  const trendLabel = `${trendUp ? "↑" : "↓"} ${Math.abs(trend)} pts this week`;

  return (
    <div className="dash-card scorecard">
      <div className="scorecard-header">
        <div className="scorecard-label">Cognitive load score</div>
        <div className={`scorecard-badge scorecard-badge--${data.level}`}>
          {data.level === "danger" ? "⚠ " : data.level === "warning" ? "◑ " : "✓ "}
          {data.statusLabel}
        </div>
      </div>

      <div className="scorecard-gauge-row">
        <ScoreGauge score={data.score} color={color} />

        <div className="scorecard-meta">
          <div
            className="scorecard-trend"
            style={{ color: trendUp ? "var(--red)" : "var(--green)" }}
          >
            {trendLabel}
          </div>
          {dangerStreak >= 2 && (
            <div className="scorecard-streak">
              {dangerStreak === 2 ? "2nd" : dangerStreak === 3 ? "3rd" : `${dangerStreak}th`} consecutive day in the danger zone
            </div>
          )}
        </div>
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
        <div className={`suggestion-label suggestion-label--${data.level}`}>
          Today&apos;s recommendation
        </div>
        <p className="suggestion-text">{data.suggestion}</p>
      </div>
    </div>
  );
}
