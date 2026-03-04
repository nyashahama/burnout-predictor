export default function CrashTimeline() {
  return (
    <section className="warning-section">
      <div className="section-label" style={{ marginBottom: "20px" }}>
        What actually happens
      </div>
      <h2 className="warning-title appear">
        The crash you didn&apos;t
        <br />
        see coming has a
        <br />
        <em>14-day story.</em>
      </h2>

      <div className="timeline">
        <div className="timeline-item appear">
          <div className="timeline-dot">😐</div>
          <div className="timeline-content">
            <div className="timeline-week">Day 1–3</div>
            <div className="timeline-text">
              Sleep slips by 45 minutes. A few late nights. Nothing unusual.
            </div>
            <div className="timeline-sub">
              Your body starts logging the debt.
            </div>
          </div>
        </div>
        <div className="timeline-item appear">
          <div className="timeline-dot">📅</div>
          <div className="timeline-content">
            <div className="timeline-week">Day 4–7</div>
            <div className="timeline-text">
              Calendar fills up. Back-to-backs all week. Deep work disappears.
            </div>
            <div className="timeline-sub">
              Cognitive load spikes. You feel productive, not strained.
            </div>
          </div>
        </div>
        <div className="timeline-item danger appear">
          <div className="timeline-dot">⚠️</div>
          <div className="timeline-content">
            <div className="timeline-week">Day 8–11 · Overload alert zone</div>
            <div className="timeline-text">
              Irritability. Slower thinking. Second-guessing decisions
              you&apos;d normally make in seconds.
            </div>
            <div className="timeline-sub">
              Decision quality drops 20–30%. You still feel &quot;okay.&quot;
            </div>
          </div>
        </div>
        <div className="timeline-item critical appear">
          <div className="timeline-dot">✕</div>
          <div className="timeline-content">
            <div className="timeline-week">Day 12–14 · The crash</div>
            <div className="timeline-text">
              You can&apos;t focus. Deadlines slide. You need two weeks to feel
              like yourself again.
            </div>
            <div className="timeline-sub">
              Everyone calls it burnout. Overload calls it avoidable.
            </div>
          </div>
        </div>
      </div>

      <div className="warning-cta appear">
        <p>&quot;Overload would have caught mine at day 7.&quot;</p>
        <button className="btn-big">Get the early warning</button>
      </div>
    </section>
  );
}
