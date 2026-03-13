"use client";

import Link from "next/link";

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
      <div className="nav-actions">
        <Link href="/login" className="nav-signin">
          Sign in
        </Link>
        <Link href="/login" className="nav-cta">
          Get started free
        </Link>
      </div>
    </nav>
  );
}
