"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!token) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <Link href="/" className="auth-logo">Over<em>load</em></Link>
          <div className="auth-heading">Invalid link</div>
          <div className="auth-error" role="alert">
            This reset link is missing a token. Please request a new one.
          </div>
          <Link href="/login" className="auth-btn" style={{ textAlign: "center", textDecoration: "none", display: "block" }}>
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      if (res.ok) {
        setDone(true);
      } else {
        const data = await res.json().catch(() => ({})) as { error?: string };
        setError(data.error ?? "Something went wrong. Please try again.");
      }
    } catch {
      setError("Could not reach the server. Check your connection.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <Link href="/" className="auth-logo">Over<em>load</em></Link>

        <div className="auth-heading">
          {done ? "Password updated" : "Set a new password"}
        </div>
        <div className="auth-sub">
          {done
            ? "You can now sign in with your new password."
            : "Choose a strong password — at least 8 characters."}
        </div>

        {done ? (
          <>
            <div className="auth-success" role="status">
              Your password has been reset successfully.
            </div>
            <Link href="/login" className="auth-btn" style={{ textAlign: "center", textDecoration: "none", display: "block" }}>
              Sign in →
            </Link>
          </>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit} noValidate aria-label="reset password form">
            <div className="auth-field">
              <label className="auth-label" htmlFor="password">New password</label>
              <input
                id="password"
                className="auth-input"
                type="password"
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                autoFocus
              />
            </div>

            <div className="auth-field">
              <label className="auth-label" htmlFor="confirm">Confirm password</label>
              <input
                id="confirm"
                className="auth-input"
                type="password"
                placeholder="Repeat your new password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
              />
            </div>

            {error && <div className="auth-error" role="alert">{error}</div>}

            <button
              className={`auth-btn${loading ? " auth-btn--loading" : ""}`}
              type="submit"
              disabled={loading}
            >
              {loading ? "Just a moment…" : "Reset password →"}
            </button>
          </form>
        )}

        {!done && (
          <div className="auth-footer">
            <Link href="/login" className="auth-link">← Back to sign in</Link>
          </div>
        )}
      </div>
    </div>
  );
}
