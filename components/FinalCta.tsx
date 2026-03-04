"use client";

import { useState } from "react";

export default function FinalCta() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = () => {
    if (email.trim()) setSubmitted(true);
  };

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

      {submitted ? (
        <div
          style={{
            color: "rgba(245,241,235,0.7)",
            fontSize: "16px",
            fontFamily: "var(--font-serif)",
            fontStyle: "italic",
            position: "relative",
          }}
        >
          You&apos;re on the list. We&apos;ll be in touch.
        </div>
      ) : (
        <div className="final-email-row">
          <input
            className="final-email-input"
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          />
          <button className="final-email-btn" onClick={handleSubmit}>
            Get started →
          </button>
        </div>
      )}

      <div className="final-fine">
        Free plan. No credit card. Takes 3 minutes to set up.
      </div>
    </section>
  );
}
