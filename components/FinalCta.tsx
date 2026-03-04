export default function FinalCta() {
  return (
    <section className="final-cta">
      <div className="final-cta-label">One last thing</div>
      <h2 className="final-cta-title">
        The next crash
        <br />
        is <em>preventable.</em>
      </h2>
      <p className="final-cta-sub">
        You already work hard. Overload just makes sure it doesn&apos;t cost you
        more than it should.
      </p>
      <div className="final-email-row">
        <input
          className="final-email-input"
          type="email"
          placeholder="your@email.com"
        />
        <button className="final-email-btn">Get started →</button>
      </div>
      <div className="final-fine">
        Free plan. No credit card. Takes 3 minutes to set up.
      </div>
    </section>
  );
}
