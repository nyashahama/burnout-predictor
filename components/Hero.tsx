"use client";

export default function Hero() {
  return (
    <section className="hero">
      <div className="hero-eyebrow">
        <div className="hero-dot" />
        Now in early access
      </div>
      <h1 className="hero-title">
        You can feel
        <br />
        the crash coming.
        <br />
        <em>Now you&apos;ll know when.</em>
      </h1>
      <p className="hero-subtitle">
        Overload watches your sleep, work, and calendar — and tells you{" "}
        <strong>14 days in advance</strong> when you&apos;re heading toward a
        wall. Not a wellness app. A performance early warning system.
      </p>
      <div className="hero-cta-group">
        <button className="btn-big">Start for free →</button>
        <div className="hero-fine">No credit card. 14-day full access.</div>
      </div>
    </section>
  );
}
