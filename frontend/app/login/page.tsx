"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { useAuth } from "@/contexts/AuthContext";
import { Button, buttonVariants } from "@/components/ui/button";
import { CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { setOnboardedCookie, setSessionCookie } from "@/lib/auth";
import type { AuthResult } from "@/lib/types";
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
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return "That doesn't look like a valid email.";
    if (mode === "signup" && !name.trim()) return "Enter your name.";
    if (mode !== "forgot" && !password) return "Enter a password.";
    if (mode === "signup" && password.length < 8) return "Password must be at least 8 characters.";
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    setLoading(true);

    try {
      if (mode === "signup") {
        sessionStorage.setItem(
          "overload-pending-register",
          JSON.stringify({ email: email.trim(), password, name: name.trim() }),
        );
        await setSessionCookie();
        router.push("/onboarding");
      } else if (mode === "signin") {
        const result = await api.post<AuthResult>(
          "/api/auth/login",
          { email: email.trim(), password },
          parseAuthResult,
        );
        await login(result);
        await setOnboardedCookie();
        router.push("/dashboard");
      } else {
        await fetch(`${API_BASE}/api/auth/forgot-password`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim() }),
        });
        setForgotSent(true);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      {mode !== "forgot" && (
        <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1">
          <Button
            type="button"
            variant={mode === "signup" ? "default" : "ghost"}
            onClick={() => switchMode("signup")}
          >
            Create account
          </Button>
          <Button
            type="button"
            variant={mode === "signin" ? "default" : "ghost"}
            onClick={() => switchMode("signin")}
          >
            Sign in
          </Button>
        </div>
      )}

      <div className="space-y-2">
        <CardTitle className="text-3xl">
          {mode === "signup" ? "Start your free trial" : mode === "signin" ? "Welcome back" : "Reset your password"}
        </CardTitle>
        <CardDescription className="text-base">
          {mode === "signup"
            ? "14 days full access. No credit card required."
            : mode === "signin"
              ? "Sign in to your Overload dashboard."
              : "We'll send a reset link to your email."}
        </CardDescription>
      </div>

      {forgotSent ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">
            If that email exists, a reset link has been sent.
          </div>
          <Button type="button" variant="ghost" onClick={() => switchMode("signin")}>
            ← Back to sign in
          </Button>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={handleSubmit} noValidate aria-label="auth form">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              autoFocus
            />
          </div>

          {mode === "signup" && (
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                type="text"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
              />
            </div>
          )}

          {mode !== "forgot" && (
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder={mode === "signup" ? "At least 8 characters" : "Your password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
              />
              {mode === "signin" && (
                <button
                  type="button"
                  className="text-sm text-primary hover:underline"
                  onClick={() => switchMode("forgot")}
                >
                  Forgot password?
                </button>
              )}
            </div>
          )}

          {error && <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">{error}</div>}

          <Button className="w-full" type="submit" disabled={loading}>
            {loading ? "Just a moment…" : mode === "signup" ? "Create account →" : mode === "signin" ? "Sign in →" : "Send reset link →"}
          </Button>
        </form>
      )}

      <div className="text-sm text-muted-foreground">
        {mode === "signup" ? (
          <>
            Already have an account?{" "}
            <button className="text-primary hover:underline" onClick={() => switchMode("signin")}>
              Log in instead
            </button>
          </>
        ) : mode === "signin" ? (
          <>
            New here?{" "}
            <button className="text-primary hover:underline" onClick={() => switchMode("signup")}>
              Create a free account
            </button>
          </>
        ) : (
          !forgotSent && (
            <button className="text-primary hover:underline" onClick={() => switchMode("signin")}>
              ← Back to sign in
            </button>
          )
        )}
      </div>

      <Link href="/" className={cn(buttonVariants({ variant: "ghost" }), "justify-start px-0 text-sm")}>
        Back to home
      </Link>
    </AuthShell>
  );
}
