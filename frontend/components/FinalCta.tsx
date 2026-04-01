"use client";

import { useState } from "react";

export default function FinalCta() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async () => {
    const trimmed = email.trim();
    if (!trimmed || status === "loading") return;

    // Basic email format check before hitting the server
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setErrorMsg("That doesn't look like a valid email.");
      return;
    }

    setStatus("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed, source: "final_cta" }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        // Duplicate email — treat as success so user isn't confused
        if (res.status === 409) {
          setStatus("success");
          return;
        }
        throw new Error(data.error || "Something went wrong.");
      }

      setStatus("success");
    } catch (err: unknown) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Couldn't save your email. Try again.");
    }
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

      {status === "success" ? (
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
        <>
          <div className="final-email-row">
            <input
              className="final-email-input"
              type="email"
              placeholder="your@email.com"
              value={email}
              disabled={status === "loading"}
              onChange={(e) => {
                setEmail(e.target.value);
                setErrorMsg("");
              }}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            />
            <button
              className="final-email-btn"
              onClick={handleSubmit}
              disabled={status === "loading"}
              style={{ opacity: status === "loading" ? 0.6 : 1 }}
            >
              {status === "loading" ? "Saving…" : "Get started →"}
            </button>
          </div>

          {errorMsg && (
            <div
              style={{
                marginTop: "10px",
                fontSize: "13px",
                color: "rgba(200,57,26,0.8)",
                fontFamily: "var(--font-sans)",
              }}
            >
              {errorMsg}
            </div>
          )}
        </>
      )}

      <div className="final-fine">
        Free plan. No credit card. Takes 3 minutes to set up.
      </div>
    </section>
  );
}
