"use client";

export default function Nav() {
  return (
    <nav>
      <div className="nav-logo">
        Over<em>load</em>
      </div>
      <ul className="nav-links">
        <li>
          <a href="#why">Why it matters</a>
        </li>
        <li>
          <a href="#how">How it works</a>
        </li>
        <li>
          <a href="#demo">Try the demo</a>
        </li>
        <li>
          <a href="#pricing">Pricing</a>
        </li>
      </ul>
      <button className="nav-cta">Get early access</button>
    </nav>
  );
}
