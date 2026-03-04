"use client";

import { useEffect, useRef } from "react";

export default function Score() {
  const scoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!scoreRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          let n = 0;
          const target = 74;
          const step = () => {
            if (n < target) {
              n = Math.min(n + 2, target);
              if (scoreRef.current) scoreRef.current.textContent = n.toString();
              requestAnimationFrame(step);
            }
          };
          requestAnimationFrame(step);
          observer.disconnect();
        }
      },
      { threshold: 0.5 },
    );

    observer.observe(scoreRef.current);
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

        <div className="score-widget appear">
          <div className="score-widget-header">
            <div>
              <div className="score-widget-name">Your cognitive load today</div>
              <div className="score-widget-date">Wednesday, March 4</div>
            </div>
            <div className="score-today-badge">⚠ High strain</div>
          </div>

          <div className="score-big">
            <div className="score-number" id="scoreNum" ref={scoreRef}>
              74
            </div>
            <div className="score-of">out of 100</div>
            <div className="score-label-text">
              You&apos;re carrying too much right now
            </div>
          </div>

          <div className="score-meanings">
            <div className="score-meaning">
              <div
                className="score-meaning-dot"
                style={{ background: "var(--red)" }}
              ></div>
              <div>Sleep deficit from last 4 nights</div>
              <div
                className="score-meaning-sub"
                style={{ color: "var(--red)" }}
              >
                −11h
              </div>
            </div>
            <div className="score-meaning">
              <div
                className="score-meaning-dot"
                style={{ background: "var(--amber)" }}
              ></div>
              <div>8 meetings today — no deep work</div>
              <div
                className="score-meaning-sub"
                style={{ color: "var(--amber)" }}
              >
                All day
              </div>
            </div>
            <div className="score-meaning">
              <div
                className="score-meaning-dot"
                style={{ background: "var(--green)" }}
              ></div>
              <div>Financial stress — no change</div>
              <div
                className="score-meaning-sub"
                style={{ color: "var(--green)" }}
              >
                Stable
              </div>
            </div>
            <div
              style={{
                marginTop: 8,
                padding: 16,
                background: "rgba(200,57,26,0.06)",
                borderRadius: 12,
                border: "1px solid rgba(200,57,26,0.12)",
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  color: "var(--red)",
                  fontWeight: 500,
                  marginBottom: 4,
                }}
              >
                Today&apos;s suggestion
              </div>
              <div
                style={{
                  fontSize: 13,
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
