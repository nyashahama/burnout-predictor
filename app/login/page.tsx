"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

function setCookie(name: string, value: string, days = 7) {
  const maxAge = days * 24 * 60 * 60;
  document.cookie = `${name}=${value}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

function getCookie(name: string) {
  return document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`))
    ?.split("=")[1];
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function validate() {
    if (!email.trim()) return "Enter your email address.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      return "That doesn't look like a valid email.";
    if (!password) return "Enter a password.";
    if (mode === "signup" && password.length < 6)
      return "Password must be at least 6 characters.";
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const err = validate();
    if (err) { setError(err); return; }

    setLoading(true);
    // Simulate a short network delay
    await new Promise((r) => setTimeout(r, 600));

    setCookie("overload-session", "1");

    if (mode === "signup") {
      // New user → go through onboarding
      router.push("/onboarding");
    } else {
      // Returning user → skip onboarding, go straight to dashboard
      setCookie("overload-onboarded", "1");
      router.push("/dashboard");
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <Link href="/" className="auth-logo">
          Over<em>load</em>
        </Link>

        <div className="auth-tabs">
          <button
            className={`auth-tab${mode === "signup" ? " auth-tab--active" : ""}`}
            onClick={() => { setMode("signup"); setError(""); }}
          >
            Create account
          </button>
          <button
            className={`auth-tab${mode === "signin" ? " auth-tab--active" : ""}`}
            onClick={() => { setMode("signin"); setError(""); }}
          >
            Sign in
          </button>
        </div>

        <div className="auth-heading">
          {mode === "signup" ? "Start your free trial" : "Welcome back"}
        </div>
        <div className="auth-sub">
          {mode === "signup"
            ? "14 days full access. No credit card required."
            : "Sign in to your Overload dashboard."}
        </div>

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <div className="auth-field">
            <label className="auth-label" htmlFor="email">Email</label>
            <input
              id="email"
              className="auth-input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              autoFocus
            />
          </div>

          <div className="auth-field">
            <label className="auth-label" htmlFor="password">Password</label>
            <input
              id="password"
              className="auth-input"
              type="password"
              placeholder={mode === "signup" ? "At least 6 characters" : "Your password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
            />
          </div>

          {error && <div className="auth-error">{error}</div>}

          <button
            className={`auth-btn${loading ? " auth-btn--loading" : ""}`}
            type="submit"
            disabled={loading}
          >
            {loading
              ? "Just a moment…"
              : mode === "signup"
              ? "Create account →"
              : "Sign in →"}
          </button>
        </form>

        <div className="auth-footer">
          {mode === "signup" ? (
            <>Already have an account?{" "}
              <button className="auth-link" onClick={() => { setMode("signin"); setError(""); }}>
                Sign in
              </button>
            </>
          ) : (
            <>New here?{" "}
              <button className="auth-link" onClick={() => { setMode("signup"); setError(""); }}>
                Create a free account
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
