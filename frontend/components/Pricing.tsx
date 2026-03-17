"use client";

const freeFeatures = [
  "Daily cognitive load score",
  "3-day forecast",
  "Sleep + calendar signals",
  "Morning check-in (30 seconds)",
  "Basic suggestions",
];

const proFeatures = [
  "Everything in Free",
  "14-day forecast with crash window",
  "Decision quality alerts",
  "Deep work + financial stress signals",
  "Specific calendar interventions",
  "Weekly insight digest",
  "Burnout trajectory detection",
];

export default function Pricing() {
  return (
    <section className="pricing-section" id="pricing">
      <div className="pricing-inner">
        <div className="pricing-header appear">
          <div className="section-label" style={{ marginBottom: "20px" }}>
            Simple pricing
          </div>
          <h2 className="pricing-title">
            Start free.
            <br />
            <em>Stay only if it helps.</em>
          </h2>
        </div>

        <div className="pricing-cards">
          {/* Free */}
          <div className="pcard appear">
            <div className="pcard-plan">Free</div>
            <div className="pcard-price">$0</div>
            <div className="pcard-period">Forever free</div>
            <ul className="pcard-features">
              {freeFeatures.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <button className="pcard-btn">Get started free</button>
          </div>

          {/* Pro */}
          <div className="pcard highlighted appear">
            <div className="pcard-tag">Most popular</div>
            <div className="pcard-plan">Pro</div>
            <div className="pcard-price">$12</div>
            <div className="pcard-period">per month · cancel anytime</div>
            <ul className="pcard-features">
              {proFeatures.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <button className="pcard-btn">Start 14-day free trial</button>
          </div>
        </div>
      </div>
    </section>
  );
}
