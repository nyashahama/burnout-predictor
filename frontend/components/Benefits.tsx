"use client";

const benefits = [
  {
    num: "1",
    title: "Tells you when a crash is coming — before you feel it",
    desc: "By the time you feel burned out, you're already two weeks into the decline. Overload catches the pattern in your sleep quality, meeting load, and energy shifts early enough that you can actually do something about it.",
  },
  {
    num: "2",
    title: "Warns you when your judgment is quietly slipping",
    desc: "Sleep debt erodes your decision-making before it affects how you feel. Overload flags when you're running below your cognitive baseline — so you can defer the irreversible decisions, and not sign anything you'll regret.",
  },
  {
    num: "3",
    title: "Gives you specific things to do. Not vague advice.",
    desc: 'Not "rest more." More like: cancel Tuesday\'s 3pm, sleep 30 minutes earlier for four nights, protect Thursday morning. Concrete interventions calibrated to your actual schedule and patterns.',
  },
];

export default function Benefits() {
  return (
    <section className="what-section">
      <div className="what-header appear">
        <div className="what-label">What Overload does</div>
        <h2 className="what-title">
          Three things your gut
          <br />
          <em>already knows</em>
          <br />
          but can&apos;t quantify.
        </h2>
      </div>

      <div className="benefits-list">
        {benefits.map((b) => (
          <div key={b.num} className="benefit appear">
            <div className="benefit-num">{b.num}</div>
            <div className="benefit-title">{b.title}</div>
            <div className="benefit-desc">{b.desc}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
