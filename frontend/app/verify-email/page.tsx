"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

type State = "loading" | "success" | "error";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const [state, setState] = useState<State>("loading");

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
      setState("error");
      return;
    }

    fetch(`${API_BASE}/api/auth/verify-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then((res) => setState(res.ok ? "success" : "error"))
      .catch(() => setState("error"));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {state === "loading" && (
        <>
          <div className="auth-heading">Verifying your email…</div>
          <div className="auth-sub">This will only take a moment.</div>
        </>
      )}

      {state === "success" && (
        <>
          <div className="auth-heading">Email verified</div>
          <div className="auth-sub">Your address is confirmed. You&apos;re good to go.</div>
          <div className="auth-success" role="status">
            Your email has been verified successfully.
          </div>
          <Link href="/login" className="auth-btn" style={{ textAlign: "center", textDecoration: "none", display: "block" }}>
            Sign in →
          </Link>
        </>
      )}

      {state === "error" && (
        <>
          <div className="auth-heading">Link expired</div>
          <div className="auth-sub">This verification link is invalid or has already been used.</div>
          <div className="auth-error" role="alert">
            Verification links expire after 24 hours. Request a new one from your dashboard.
          </div>
          <Link href="/login" className="auth-btn" style={{ textAlign: "center", textDecoration: "none", display: "block" }}>
            Back to sign in
          </Link>
        </>
      )}
    </>
  );
}

export default function VerifyEmailPage() {
  return (
    <div className="auth-page">
      <div className="auth-card">
        <Link href="/" className="auth-logo">
          Over<em>load</em>
        </Link>
        <Suspense fallback={
          <>
            <div className="auth-heading">Verifying your email…</div>
            <div className="auth-sub">This will only take a moment.</div>
          </>
        }>
          <VerifyEmailContent />
        </Suspense>
      </div>
    </div>
  );
}
