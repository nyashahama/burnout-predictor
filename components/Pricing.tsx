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
          <div className="pcard appear">
            <div className="pcard-plan">Free</div>
            <div className="pcard-price">$0</div>
            <div className="pcard-period">Forever free</div>
            <ul className="pcard-features">
              <li>Daily cognitive load score</li>
              <li>3-day forecast</li>
              <li>Sleep + calendar signals</li>
              <li>Morning check-in (30 seconds)</li>
              <li>Basic suggestions</li>
            </ul>
            <button className="pcard-btn">Get started free</button>
          </div>
          <div className="pcard highlighted appear">
            <div className="pcard-tag">Most popular</div>
            <div className="pcard-plan">Pro</div>
            <div className="pcard-price">$12</div>
            <div className="pcard-period">per month · cancel anytime</div>
            <ul className="pcard-features">
              <li>Everything in Free</li>
              <li>14-day forecast with crash window</li>
              <li>Decision quality alerts</li>
              <li>Deep work + financial stress signals</li>
              <li>Specific calendar interventions</li>
              <li>Weekly insight digest</li>
              <li>Burnout trajectory detection</li>
            </ul>
            <button className="pcard-btn">Start 14-day free trial</button>
          </div>
        </div>
      </div>
    </section>
  );
}
