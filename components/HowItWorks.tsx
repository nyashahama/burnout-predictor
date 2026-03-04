"use client";

const steps = [
  {
    num: "1",
    title: "Connect your tools",
    desc: "Calendar, sleep tracker, and a 30-second daily check-in. No lengthy setup. Done in under 5 minutes.",
  },
  {
    num: "2",
    title: "We learn your patterns",
    desc: "Over 14 days, Overload learns your normal — your typical sleep, your workload rhythm. Your score is calibrated to you, not a population average.",
  },
  {
    num: "3",
    title: "You get warned, not worried",
    desc: "A daily score, a 7-day forecast, and a notification when something needs attention. Speaks up when it matters. Quiet when it doesn't.",
  },
];

export default function HowItWorks() {
  return (
    <section className="how-section" id="how">
      <div className="how-inner">
        <div className="how-header appear">
          <div className="section-label" style={{ marginBottom: "20px" }}>
            How it works
          </div>
          <h2 className="how-title">
            Connect once.
            <br />
            <em>Know always.</em>
          </h2>
        </div>

        <div className="steps">
          {steps.map((s) => (
            <div key={s.num} className="step appear">
              <div className="step-num">{s.num}</div>
              <h3 className="step-title">{s.title}</h3>
              <p className="step-desc">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
