"use client";

const steps = [
  {
    emoji: "😐",
    week: "Day 1–3",
    text: "Sleep slips by 45 minutes. A few late nights. Nothing unusual.",
    sub: "Your body starts logging the debt.",
    variant: "",
  },
  {
    emoji: "📅",
    week: "Day 4–7",
    text: "Calendar fills up. Back-to-backs all week. Deep work disappears.",
    sub: "Cognitive load spikes. You feel productive, not strained.",
    variant: "",
  },
  {
    emoji: "⚠️",
    week: "Day 8–11 · Overload alert zone",
    text: "Irritability. Slower thinking. Second-guessing decisions you'd normally make in seconds.",
    sub: "Decision quality drops 20–30%. You still feel 'okay.'",
    variant: "danger",
  },
  {
    emoji: "✕",
    week: "Day 12–14 · The crash",
    text: "You can't focus. Deadlines slide. You need two weeks to feel like yourself again.",
    sub: "Everyone calls it burnout. Overload calls it avoidable.",
    variant: "critical",
  },
];

export default function CrashTimeline() {
  return (
    <section className="warning-section">
      <div className="section-label" style={{ marginBottom: "20px" }}>
        What actually happens
      </div>
      <h2 className="warning-title appear">
        The crash you didn&apos;t
        <br />
        see coming has a<br />
        <em>14-day story.</em>
      </h2>

      <div className="timeline">
        {steps.map((s, i) => (
          <div
            key={i}
            className={`timeline-item appear${s.variant ? " " + s.variant : ""}`}
          >
            <div className="timeline-dot">{s.emoji}</div>
            <div className="timeline-content">
              <div className="timeline-week">{s.week}</div>
              <div className="timeline-text">{s.text}</div>
              <div className="timeline-sub">{s.sub}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="warning-cta appear">
        <p>&ldquo;Overload would have caught mine at day 7.&rdquo;</p>
        <button className="btn-big">Get the early warning</button>
      </div>
    </section>
  );
}
