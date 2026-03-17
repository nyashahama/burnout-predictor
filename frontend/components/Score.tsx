"use client";

import { useEffect, useRef, useState } from "react";

const signals = [
  {
    label: "Sleep deficit from last 4 nights",
    val: "−11h",
    color: "var(--red)",
  },
  {
    label: "8 meetings today — no deep work",
    val: "All day",
    color: "var(--amber)",
  },
  {
    label: "Financial stress — no change",
    val: "Stable",
    color: "var(--green)",
  },
];

export default function Score() {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const animated = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !animated.current) {
          animated.current = true;
          let n = 0;
          const tick = () => {
            n = Math.min(n + 2, 74);
            setCount(n);
            if (n < 74) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      },
      { threshold: 0.5 },
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="score-section">
      <div className="score-inner">
        <div className="score-copy appear">
          <div className="score-copy-label">Your daily score</div>
          <h2 className="score-copy-title">
            One number.
            <br />
            <em>The truth</em> about
            <br />
            how you&apos;re running.
          </h2>
          <p className="score-copy-body">
            Your score updates throughout the day, drawing on everything — how
            you slept, what your calendar looks like, how your morning check-in
            went.
            <br />
            <br />
            <strong>Below 40?</strong> You&apos;re in your zone. Trust your
            instincts.
            <br />
            <strong>40–65?</strong> Watch the big decisions. Protect your
            energy.
            <br />
            <strong>Above 65?</strong> Something has to give. Overload will tell
            you what.
          </p>
        </div>

        <div className="score-widget appear" ref={ref}>
          <div className="score-widget-header">
            <div>
              <div className="score-widget-name">Your cognitive load today</div>
              <div className="score-widget-date">Wednesday, March 4</div>
            </div>
            <div className="score-today-badge">⚠ High strain</div>
          </div>

          <div className="score-big">
            <div className="score-number" style={{ color: "var(--red)" }}>
              {count}
            </div>
            <div className="score-of">out of 100</div>
            <div className="score-label-text">
              You&apos;re carrying too much right now
            </div>
          </div>

          <div className="score-meanings">
            {signals.map((s, i) => (
              <div key={i} className="score-meaning">
                <div
                  className="score-meaning-dot"
                  style={{ background: s.color }}
                />
                <div>{s.label}</div>
                <div className="score-meaning-sub" style={{ color: s.color }}>
                  {s.val}
                </div>
              </div>
            ))}

            <div
              style={{
                marginTop: "8px",
                padding: "16px",
                background: "rgba(200,57,26,0.06)",
                borderRadius: "12px",
                border: "1px solid rgba(200,57,26,0.12)",
              }}
            >
              <div
                style={{
                  fontSize: "13px",
                  color: "var(--red)",
                  fontWeight: 500,
                  marginBottom: "4px",
                }}
              >
                Today&apos;s suggestion
              </div>
              <div
                style={{
                  fontSize: "13px",
                  color: "var(--muted)",
                  lineHeight: 1.55,
                }}
              >
                Block Thursday 9–11am. Cancel the 3pm standup. Sleep 30 minutes
                earlier tonight.
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
