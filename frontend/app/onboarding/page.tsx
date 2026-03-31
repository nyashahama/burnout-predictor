"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { Button } from "@/components/ui/button";
import { CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { safeParseJson } from "@/lib/storage";
import { setOnboardedCookie } from "@/lib/auth";
import { useAuth } from "@/contexts/AuthContext";
import type { AuthResult } from "@/lib/types";
import { parseAuthResult } from "@/lib/validators";

const roles = [
  { value: "engineer", label: "Software Engineer", icon: "💻" },
  { value: "pm", label: "Product Manager", icon: "📋" },
  { value: "designer", label: "Designer", icon: "🎨" },
  { value: "manager", label: "Manager / Lead", icon: "👥" },
  { value: "founder", label: "Founder / Exec", icon: "🚀" },
  { value: "other", label: "Other", icon: "📌" },
];

const sleepOptions = [
  { value: "6", label: "6h or less", sub: "I'm chronically short" },
  { value: "7", label: "7 hours", sub: "A bit below ideal" },
  { value: "8", label: "8 hours", sub: "The sweet spot" },
  { value: "9", label: "9h or more", sub: "I prioritise recovery" },
];

const openingOptions = [
  { value: "this-week", label: "This week", sub: "I've been pretty good lately" },
  { value: "two-weeks", label: "A week or two ago", sub: "Something's been building" },
  { value: "month-plus", label: "Over a month ago", sub: "I've been running on empty" },
  { value: "cant-remember", label: "Honestly, I can't remember", sub: "That itself says something" },
];

function estimateScore(lastFelt: string, role: string, sleep: string): number {
  const base: Record<string, number> = { "this-week": 28, "two-weeks": 50, "month-plus": 66, "cant-remember": 74 };
  const roleMod: Record<string, number> = { founder: 7, manager: 4, pm: 3, engineer: 0, designer: -2, other: 0 };
  const sleepMod: Record<string, number> = { "6": 14, "7": 6, "8": 0, "9": -5 };
  const raw = (base[lastFelt] ?? 50) + (roleMod[role] ?? 0) + (sleepMod[sleep] ?? 0);
  return Math.max(12, Math.min(88, Math.round(raw)));
}

function scoreLabel(score: number) {
  if (score > 65) return "High strain";
  if (score > 40) return "Moderate load";
  return "In your zone";
}

export default function OnboardingPage() {
  const router = useRouter();
  const { login, api } = useAuth();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [lastFelt, setLastFelt] = useState("");
  const [role, setRole] = useState("");
  const [sleep, setSleep] = useState("");
  const [score, setScore] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function handleCalculate() {
    setScore(estimateScore(lastFelt, role, sleep));
    setStep(4);
  }

  async function handleFinish() {
    setLoading(true);
    setError("");
    try {
      const pending = safeParseJson<{ email?: string; password?: string; name?: string }>(
        sessionStorage.getItem("overload-pending-register"),
        {},
      );
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      const result = await api.post<AuthResult>(
        "/api/auth/register",
        {
          email: pending.email ?? "",
          password: pending.password ?? "",
          name: name.trim() || pending.name || "there",
          role,
          sleep_baseline: parseInt(sleep, 10),
          timezone: tz,
        },
        parseAuthResult,
      );
      sessionStorage.removeItem("overload-pending-register");
      await login(result);
      localStorage.setItem("overload-name", result.user.name);
      localStorage.setItem("overload-role", result.user.role);
      localStorage.setItem("overload-sleep", String(result.user.sleep_baseline));
      localStorage.setItem("overload-last-felt", lastFelt);
      await setOnboardedCookie();
      router.push("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const canContinue =
    (step === 0 && name.trim()) ||
    (step === 1 && lastFelt) ||
    (step === 2 && role) ||
    (step === 3 && sleep);

  return (
    <AuthShell>
      <div className="space-y-2">
        <CardTitle className="text-3xl">Let&apos;s calibrate your baseline</CardTitle>
        <CardDescription className="text-base">
          Four quick steps, then we estimate where your load is starting from.
        </CardDescription>
      </div>

      <div className="flex gap-2">
        {[0, 1, 2, 3].map((n) => (
          <div key={n} className={`h-2 flex-1 rounded-full ${step >= n ? "bg-primary" : "bg-muted"}`} />
        ))}
      </div>

      {step === 0 && (
        <div className="space-y-4">
          <div className="space-y-2">
            <CardTitle className="text-2xl">What should we call you?</CardTitle>
            <CardDescription>We use your name in the dashboard and check-in flow.</CardDescription>
          </div>
          <Input
            placeholder="Your first name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <Button disabled={!canContinue} onClick={() => setStep(1)} className="w-full">
            Continue →
          </Button>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <div className="space-y-2">
            <CardTitle className="text-2xl">When did you last feel like yourself?</CardTitle>
            <CardDescription>Pick the answer that feels closest, not perfect.</CardDescription>
          </div>
          <div className="grid gap-3">
            {openingOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setLastFelt(option.value)}
                className={`rounded-xl border p-4 text-left ${lastFelt === option.value ? "border-primary bg-primary/5" : "border-border bg-background hover:bg-accent"}`}
              >
                <div className="font-medium">{option.label}</div>
                <div className="mt-1 text-sm text-muted-foreground">{option.sub}</div>
              </button>
            ))}
          </div>
          <Button disabled={!canContinue} onClick={() => setStep(2)} className="w-full">
            Continue →
          </Button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="space-y-2">
            <CardTitle className="text-2xl">What&apos;s your role?</CardTitle>
            <CardDescription>Role affects the baseline pressure we start from.</CardDescription>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {roles.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setRole(option.value)}
                className={`rounded-xl border p-4 text-left ${role === option.value ? "border-primary bg-primary/5" : "border-border bg-background hover:bg-accent"}`}
              >
                <div className="text-xl">{option.icon}</div>
                <div className="mt-2 font-medium">{option.label}</div>
              </button>
            ))}
          </div>
          <Button disabled={!canContinue} onClick={() => setStep(3)} className="w-full">
            Continue →
          </Button>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <div className="space-y-2">
            <CardTitle className="text-2xl">How much sleep do you usually get?</CardTitle>
            <CardDescription>Sleep baseline changes how fast stress compounds.</CardDescription>
          </div>
          <div className="grid gap-3">
            {sleepOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setSleep(option.value)}
                className={`rounded-xl border p-4 text-left ${sleep === option.value ? "border-primary bg-primary/5" : "border-border bg-background hover:bg-accent"}`}
              >
                <div className="font-medium">{option.label}</div>
                <div className="mt-1 text-sm text-muted-foreground">{option.sub}</div>
              </button>
            ))}
          </div>
          <Button disabled={!canContinue} onClick={handleCalculate} className="w-full">
            Calculate my score →
          </Button>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-6 text-center">
            <div className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Starting estimate</div>
            <div className="mt-3 text-6xl font-semibold text-primary">{score}</div>
            <div className="mt-2 text-lg text-foreground">{scoreLabel(score)}</div>
          </div>
          <CardDescription className="text-base leading-7">
            This is your opening estimate based on recovery, role, and how long the strain has been building. Daily check-ins will replace this with your real pattern quickly.
          </CardDescription>
          {error && <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">{error}</div>}
          <Button className="w-full" disabled={loading} onClick={handleFinish}>
            {loading ? "Just a moment…" : "Let's start tracking →"}
          </Button>
        </div>
      )}
    </AuthShell>
  );
}
