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
          <div className="step appear">
            <div className="step-num">1</div>
            <h3 className="step-title">Connect your tools</h3>
            <p className="step-desc">
              Calendar, sleep tracker, and a 30-second daily check-in. No
              lengthy setup. Done in under 5 minutes.
            </p>
          </div>
          <div className="step appear">
            <div className="step-num">2</div>
            <h3 className="step-title">We learn your patterns</h3>
            <p className="step-desc">
              Over 14 days, Overload learns your normal — your typical sleep,
              your workload rhythm. Your score is calibrated to you, not a
              population average.
            </p>
          </div>
          <div className="step appear">
            <div className="step-num">3</div>
            <h3 className="step-title">You get warned, not worried</h3>
            <p className="step-desc">
              A daily score, a 7-day forecast, and a notification when something
              needs attention. Speaks up when it matters. Quiet when it
              doesn&apos;t.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
