"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    void error;
  }, [error]);

  return (
    <main className="auth-page">
      <div className="auth-card">
        <div className="auth-heading">Something broke</div>
        <div className="auth-sub">
          An unexpected error interrupted this page. Try the action again.
        </div>
        <button className="auth-btn" onClick={reset}>
          Try again
        </button>
      </div>
    </main>
  );
}
