"use client";

const testimonials = [
  {
    featured: true,
    text: "I used to think I was just bad at pacing myself. Turns out I was sleeping 45 minutes less than my baseline for two weeks before every burnout episode. I couldn't see the pattern. Overload showed me in three days.",
    name: "Maya R.",
    role: "Founder · B2B SaaS · San Francisco",
    initial: "M",
  },
  {
    featured: false,
    text: "I pushed a big technical decision the day my score was 81. Now I just don't open that document when it's red.",
    name: "James T.",
    role: "Staff Engineer",
    initial: "J",
  },
  {
    featured: false,
    text: "Not a wellness app. It doesn't feel like one. It's like a very blunt advisor who actually has data.",
    name: "Sofia C.",
    role: "Director of Product · Series B",
    initial: "S",
  },
];

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
          {testimonials.map((t, i) => (
            <div
              key={i}
              className={`tcard appear${t.featured ? " featured" : ""}`}
            >
              <div className="tcard-stars">
                <span style={{ color: "var(--amber)" }}>★★★★★</span>
              </div>
              <div className="tcard-text">&ldquo;{t.text}&rdquo;</div>
              <div className="tcard-author">
                <div className="tcard-avatar">{t.initial}</div>
                <div>
                  <div className="tcard-name">{t.name}</div>
                  <div className="tcard-role">{t.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
