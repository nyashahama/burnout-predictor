"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import type { AuthResult } from "@/lib/types";
import { setOnboardedCookie, setSessionCookie } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const { login, api } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function validate() {
    if (!email.trim()) return "Enter your email address.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      return "That doesn't look like a valid email.";
    if (mode === "signup" && !name.trim()) return "Enter your name.";
    if (!password) return "Enter a password.";
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
        setSessionCookie();
        router.push("/onboarding");
      } else {
        const result = await api.post<AuthResult>("/api/auth/login", {
          email: email.trim(),
          password,
        });
        login(result);
        setOnboardedCookie();
        router.push("/dashboard");
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
          </div>

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
              : "Sign in →"}
          </button>
        </form>

        <div className="auth-footer">
          {mode === "signup" ? (
            <>Already have an account?{" "}
              <button className="auth-link" onClick={() => { setMode("signin"); setError(""); }}>
                Log in instead
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
