"use client";

const quotes = [
  {
    text: "I kept saying I was fine. Then I slept 13 hours on a Saturday and couldn't work for two weeks.",
    who: "Founder, 34 — after Series A sprint",
    tag: "Sound familiar?",
    highlight: false,
  },
  {
    text: "I knew something was wrong but I couldn't put my finger on it. I just kept pushing.",
    who: "Senior Engineer, 29",
    tag: null,
    highlight: true,
  },
  {
    text: "My best decisions happen in the first two hours of the day. By 4pm I'm signing things I regret.",
    who: "Director of Product, 38",
    tag: null,
    highlight: false,
  },
];

export default function Recognition() {
  return (
    <section className="recognition" id="why">
      <div className="section-label">You&apos;ve been here before</div>

      <div className="recognition-cards">
        {quotes.map((q, i) => (
          <div
            key={i}
            className={`rcard appear${q.highlight ? " highlight" : ""}`}
          >
            {q.tag && <div className="rcard-tag">{q.tag}</div>}
            <div className="rcard-quote">&ldquo;{q.text}&rdquo;</div>
            <div className="rcard-who">{q.who}</div>
          </div>
        ))}
      </div>

      <p className="recognition-hook appear">
        The crash doesn&apos;t surprise your body.
        <br />
        It surprises <em>your calendar.</em>
      </p>
    </section>
  );
}
