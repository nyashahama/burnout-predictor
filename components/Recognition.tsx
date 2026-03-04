export default function Recognition() {
  return (
    <section className="recognition" id="why">
      <div className="section-label">You&apos;ve been here before</div>
      <div className="recognition-cards">
        <div className="rcard appear">
          <div className="rcard-tag">Sound familiar?</div>
          <div className="rcard-quote">
            &quot;I kept saying I was fine. Then I slept 13 hours on a Saturday
            and couldn&apos;t work for two weeks.&quot;
          </div>
          <div className="rcard-who">Founder, 34 — after Series A sprint</div>
        </div>
        <div className="rcard appear highlight">
          <div className="rcard-quote">
            &quot;I knew something was wrong but I couldn&apos;t put my finger
            on it. I just kept pushing.&quot;
          </div>
          <div className="rcard-who">Senior Engineer, 29</div>
        </div>
        <div className="rcard appear">
          <div className="rcard-quote">
            &quot;My best decisions happen in the first two hours of the day. By
            4pm I&apos;m signing things I regret.&quot;
          </div>
          <div className="rcard-who">Director of Product, 38</div>
        </div>
      </div>
      <p className="recognition-hook appear">
        The crash doesn&apos;t surprise your body.
        <br />
        It surprises <em>your calendar.</em>
      </p>
    </section>
  );
}
