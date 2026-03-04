export default function Testimonials() {
  return (
    <section className="proof-section">
      <div className="proof-inner">
        <div className="proof-header appear">
          <div className="section-label" style={{ marginBottom: "20px" }}>
            Early users
          </div>
          <h2 className="proof-title">
            The people who use it
            <br />
            stop being <em>surprised</em> by themselves.
          </h2>
        </div>
        <div className="testimonials">
          <div className="tcard featured appear">
            <div className="tcard-stars">
              <span style={{ color: "var(--amber)" }}>★★★★★</span>
            </div>
            <div className="tcard-text">
              &quot;I used to think I was just bad at pacing myself. Turns out I
              was sleeping 45 minutes less than my baseline for two weeks before
              every burnout episode. I couldn&apos;t see the pattern. Overload
              showed me in three days.&quot;
            </div>
            <div className="tcard-author">
              <div className="tcard-avatar">M</div>
              <div>
                <div className="tcard-name">Maya R.</div>
                <div className="tcard-role">
                  Founder · B2B SaaS · San Francisco
                </div>
              </div>
            </div>
          </div>
          <div className="tcard appear">
            <div className="tcard-stars">
              <span style={{ color: "var(--amber)" }}>★★★★★</span>
            </div>
            <div className="tcard-text">
              &quot;I pushed a big technical decision the day my score was 81.
              Now I just don&apos;t open that document when it&apos;s red.&quot;
            </div>
            <div className="tcard-author">
              <div className="tcard-avatar">J</div>
              <div>
                <div className="tcard-name">James T.</div>
                <div className="tcard-role">Staff Engineer</div>
              </div>
            </div>
          </div>
          <div className="tcard appear">
            <div className="tcard-stars">
              <span style={{ color: "var(--amber)" }}>★★★★★</span>
            </div>
            <div className="tcard-text">
              &quot;Not a wellness app. It doesn&apos;t feel like one. It&apos;s
              like a very blunt advisor who actually has data.&quot;
            </div>
            <div className="tcard-author">
              <div className="tcard-avatar">S</div>
              <div>
                <div className="tcard-name">Sofia C.</div>
                <div className="tcard-role">Director of Product · Series B</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
