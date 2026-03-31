"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import type { AuthResult } from "@/lib/types";
import { setOnboardedCookie, setSessionCookie } from "@/lib/auth";
import { parseAuthResult } from "@/lib/validators";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

export default function LoginPage() {
  const router = useRouter();
  const { login, api } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signup");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [forgotSent, setForgotSent] = useState(false);
  const [loading, setLoading] = useState(false);

  function switchMode(next: "signin" | "signup" | "forgot") {
    setMode(next);
    setError("");
    setForgotSent(false);
  }

  function validate() {
    if (!email.trim()) return "Enter your email address.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      return "That doesn't look like a valid email.";
    if (mode === "signup" && !name.trim()) return "Enter your name.";
    if (mode !== "forgot" && !password) return "Enter a password.";
    if (mode === "signup" && password.length < 8)
      return "Password must be at least 8 characters.";
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const err = validate();
    if (err) { setError(err); return; }
    setLoading(true);

    try {
      if (mode === "signup") {
        sessionStorage.setItem(
          "overload-pending-register",
          JSON.stringify({ email: email.trim(), password, name: name.trim() })
        );
        await setSessionCookie();
        router.push("/onboarding");
      } else if (mode === "signin") {
        const result = await api.post<AuthResult>("/api/auth/login", {
          email: email.trim(),
          password,
        }, parseAuthResult);
        await login(result);
        await setOnboardedCookie();
        router.push("/dashboard");
      } else {
        // forgot password — always show the same message to prevent enumeration
        await fetch(`${API_BASE}/api/auth/forgot-password`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim() }),
        });
        setForgotSent(true);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <Link href="/" className="auth-logo">
          Over<em>load</em>
        </Link>

        {mode !== "forgot" && (
          <div className="auth-tabs">
            <button
              className={`auth-tab${mode === "signup" ? " auth-tab--active" : ""}`}
              onClick={() => switchMode("signup")}
            >
              Create account
            </button>
            <button
              className={`auth-tab${mode === "signin" ? " auth-tab--active" : ""}`}
              onClick={() => switchMode("signin")}
            >
              Sign in
            </button>
          </div>
        )}

        <div className="auth-heading">
          {mode === "signup" ? "Start your free trial"
            : mode === "signin" ? "Welcome back"
            : "Reset your password"}
        </div>
        <div className="auth-sub">
          {mode === "signup"
            ? "14 days full access. No credit card required."
            : mode === "signin"
            ? "Sign in to your Overload dashboard."
            : "We'll send a reset link to your email."}
        </div>

        {forgotSent ? (
          <>
            <div className="auth-success" role="status">
              If that email exists, a reset link has been sent.
            </div>
            <div className="auth-footer">
              <button className="auth-link" onClick={() => switchMode("signin")}>
                ← Back to sign in
              </button>
            </div>
          </>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit} noValidate aria-label="auth form">
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

            {mode === "signup" && (
              <div className="auth-field">
                <label className="auth-label" htmlFor="name">Name</label>
                <input
                  id="name"
                  className="auth-input"
                  type="text"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                />
              </div>
            )}

            {mode !== "forgot" && (
              <div className="auth-field">
                <label className="auth-label" htmlFor="password">Password</label>
                <input
                  id="password"
                  className="auth-input"
                  type="password"
                  placeholder={mode === "signup" ? "At least 8 characters" : "Your password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                />
                {mode === "signin" && (
                  <button
                    type="button"
                    className="auth-link"
                    style={{ alignSelf: "flex-end", fontSize: "12px" }}
                    onClick={() => switchMode("forgot")}
                  >
                    Forgot password?
                  </button>
                )}
              </div>
            )}

            {error && <div className="auth-error" role="alert">{error}</div>}

            <button
              className={`auth-btn${loading ? " auth-btn--loading" : ""}`}
              type="submit"
              disabled={loading}
            >
              {loading
                ? "Just a moment…"
                : mode === "signup"
                ? "Create account →"
                : mode === "signin"
                ? "Sign in →"
                : "Send reset link →"}
            </button>
          </form>
        )}

        <div className="auth-footer">
          {mode === "signup" ? (
            <>Already have an account?{" "}
              <button className="auth-link" onClick={() => switchMode("signin")}>
                Log in instead
              </button>
            </>
          ) : mode === "signin" ? (
            <>New here?{" "}
              <button className="auth-link" onClick={() => switchMode("signup")}>
                Create a free account
              </button>
            </>
          ) : (
            !forgotSent && (
              <button className="auth-link" onClick={() => switchMode("signin")}>
                ← Back to sign in
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}
