"use client";

import { useEffect, useRef, useState } from "react";

export default function Demo() {
  const [fullscreen, setFullscreen] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const fullIframeRef = useRef<HTMLIFrameElement>(null);

  // Close fullscreen on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Prevent body scroll when fullscreen
  useEffect(() => {
    document.body.style.overflow = fullscreen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [fullscreen]);

  return (
    <>
      <section className="demo-section" id="demo">
        <div className="demo-section-header">
          <div className="demo-section-label">Live interactive demo</div>
          <h2 className="demo-section-title">
            Watch a crash happen.
            <br />
            Then find out <em>where you stand.</em>
          </h2>
          <p className="demo-section-sub">
            Follow Alex through her 14-day burnout story — then answer three
            questions to get your own score.
          </p>
        </div>

        <div className="demo-chrome">
          {/* Browser chrome bar */}
          <div className="demo-chrome-bar">
            <div className="demo-chrome-dots">
              <div className="demo-chrome-dot" />
              <div className="demo-chrome-dot" />
              <div className="demo-chrome-dot" />
            </div>
            <div className="demo-chrome-url">app.overload.so/demo</div>
            <div className="demo-chrome-badge">Demo</div>
          </div>

          {/* Iframe frame */}
          <div className="demo-frame-wrap">
            <iframe
              ref={iframeRef}
              src="/demo.html"
              title="Overload Interactive Demo"
              allow="autoplay"
            />
          </div>
        </div>

        {/* Expand / open standalone */}
        <div className="demo-expand-row">
          <button
            className="demo-expand-btn"
            onClick={() => setFullscreen(true)}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path
                d="M1 5V1h4M9 1h4v4M13 9v4H9M5 13H1V9"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Open fullscreen
          </button>
          <a
            className="demo-expand-btn"
            href="/demo.html"
            target="_blank"
            rel="noopener noreferrer"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path
                d="M6 2H2a1 1 0 00-1 1v9a1 1 0 001 1h9a1 1 0 001-1V8M8 1h5v5M13 1L7 7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Open in new tab
          </a>
        </div>
      </section>

      {/* Fullscreen overlay */}
      <div className={`demo-fullscreen-overlay${fullscreen ? " open" : ""}`}>
        <div className="demo-fullscreen-bar">
          <div className="demo-fullscreen-title">
            Over<em>load</em> — Interactive Demo
          </div>
          <button
            className="demo-close-btn"
            onClick={() => setFullscreen(false)}
          >
            ✕ Close
          </button>
        </div>
        {fullscreen && (
          <iframe
            ref={fullIframeRef}
            src="/demo.html"
            className="demo-fullscreen-frame"
            title="Overload Interactive Demo — Fullscreen"
            allow="autoplay"
          />
        )}
      </div>
    </>
  );
}
