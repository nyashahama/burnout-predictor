"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import type { AuthResult } from "@/lib/types";
import { setOnboardedCookie } from "@/lib/auth";

// ── Data ──────────────────────────────────────────────────────────────────────

const roles = [
  { value: "engineer", label: "Software Engineer", icon: "💻" },
  { value: "pm",       label: "Product Manager",   icon: "📋" },
  { value: "designer", label: "Designer",           icon: "🎨" },
  { value: "manager",  label: "Manager / Lead",     icon: "👥" },
  { value: "founder",  label: "Founder / Exec",     icon: "🚀" },
  { value: "other",    label: "Other",              icon: "📌" },
];

const sleepOptions = [
  { value: "6", label: "6h or less", icon: "😴", sub: "I'm chronically short" },
  { value: "7", label: "7 hours",    icon: "💤", sub: "A bit below ideal" },
  { value: "8", label: "8 hours",    icon: "🌙", sub: "The sweet spot" },
  { value: "9", label: "9h or more", icon: "⭐", sub: "I prioritise recovery" },
];

const openingOptions = [
  { value: "this-week",     label: "This week",                   sub: "I've been pretty good lately" },
  { value: "two-weeks",     label: "A week or two ago",           sub: "Something's been building" },
  { value: "month-plus",    label: "Over a month ago",            sub: "I've been running on empty" },
  { value: "cant-remember", label: "Honestly, I can't remember",  sub: "That itself says something" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function estimateScore(lastFelt: string, role: string, sleep: string): number {
  const base: Record<string, number> = {
    "this-week":      28,
    "two-weeks":      50,
    "month-plus":     66,
    "cant-remember":  74,
  };
  const roleMod: Record<string, number> = {
    founder: 7, manager: 4, pm: 3, engineer: 0, designer: -2, other: 0,
  };
  const sleepMod: Record<string, number> = {
    "6": 14, "7": 6, "8": 0, "9": -5,
  };
  const raw =
    (base[lastFelt] ?? 50) +
    (roleMod[role] ?? 0) +
    (sleepMod[sleep] ?? 0);
  return Math.max(12, Math.min(88, Math.round(raw)));
}

function scoreColor(score: number) {
  if (score > 65) return "var(--red)";
  if (score > 40) return "var(--amber)";
  return "var(--green)";
}

function scoreLabel(score: number) {
  if (score > 65) return "High strain";
  if (score > 40) return "Moderate load";
  return "In your zone";
}

function scoreLevel(score: number): "danger" | "warning" | "ok" {
  if (score > 65) return "danger";
  if (score > 40) return "warning";
  return "ok";
}

function getRevealContext(
  lastFelt: string,
  role: string,
  sleep: string,
): { headline: string; body: string } {
  const sleepLabel: Record<string, string> = {
    "6": "6 hours or less", "7": "7 hours", "8": "8 hours", "9": "9+ hours",
  };
  const roleLabel: Record<string, string> = {
    engineer: "engineer", pm: "PM", designer: "designer",
    manager: "manager", founder: "founder", other: "knowledge worker",
  };
  const sl = sleepLabel[sleep] ?? "";
  const rl = roleLabel[role] ?? "knowledge worker";

  const headlines: Record<string, string> = {
    "this-week":      "You're starting from a reasonable place.",
    "two-weeks":      "Something has been quietly building.",
    "month-plus":     "You've been carrying this longer than you realise.",
    "cant-remember":  "When the last good day is a blur, that's a signal in itself.",
  };
  const bodies: Record<string, string> = {
    "this-week":      `As a ${rl} sleeping ${sl}, you have room to work with. Overload will track whether you're protecting it.`,
    "two-weeks":      `As a ${rl} sleeping ${sl}, pressure has been accumulating. The next two weeks will be revealing.`,
    "month-plus":     `As a ${rl} sleeping ${sl}, recovery is possible — but it requires deliberate action, not just hoping for a lighter week.`,
    "cant-remember":  `As a ${rl} sleeping ${sl}, your baseline needs rebuilding. That starts with understanding the pattern.`,
  };

  return {
    headline: headlines[lastFelt] ?? "",
    body: bodies[lastFelt] ?? "",
  };
}

// ── Score Gauge ───────────────────────────────────────────────────────────────

// 160×160 SVG, r=64, 270° arc, gap at bottom-center
const R = 64;
const CX = 80;
const CY = 80;
const CIRC = 2 * Math.PI * R;          // 402.124
const ARC = CIRC * 0.75;               // 301.593 — 270° worth

function ScoreGauge({ score }: { score: number }) {
  const [offset, setOffset] = useState(ARC); // start fully empty

  useEffect(() => {
    const t = setTimeout(() => setOffset(ARC * (1 - score / 100)), 80);
    return () => clearTimeout(t);
  }, [score]);

  return (
    <svg width="160" height="160" viewBox="0 0 160 160" className="onb-reveal-svg">
      {/* Track */}
      <circle
        cx={CX} cy={CY} r={R}
        fill="none"
        stroke="var(--paper-3)"
        strokeWidth="10"
        strokeDasharray={`${ARC} ${CIRC}`}
        strokeLinecap="round"
        transform={`rotate(135 ${CX} ${CY})`}
      />
      {/* Fill */}
      <circle
        cx={CX} cy={CY} r={R}
        fill="none"
        stroke={scoreColor(score)}
        strokeWidth="10"
        strokeDasharray={`${ARC} ${CIRC}`}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(135 ${CX} ${CY})`}
        style={{
          transition: "stroke-dashoffset 1.5s cubic-bezier(0.4, 0, 0.2, 1), stroke 0.3s",
        }}
      />
    </svg>
  );
}

// ── Counting number ───────────────────────────────────────────────────────────

function CountingScore({ target }: { target: number }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const DURATION = 1500;
    const start = Date.now();
    let raf: number;
    const tick = () => {
      const progress = Math.min((Date.now() - start) / DURATION, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setDisplay(Math.round(eased * target));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    const t = setTimeout(() => { raf = requestAnimationFrame(tick); }, 80);
    return () => { clearTimeout(t); cancelAnimationFrame(raf); };
  }, [target]);

  return <>{display}</>;
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const TOTAL_STEPS = 4; // steps 0–3 before reveal

export default function OnboardingPage() {
  const router = useRouter();
  const { login, api } = useAuth();
  const [step, setStep]         = useState(0);
  const [name, setName]         = useState("");
  const [lastFelt, setLastFelt] = useState("");
  const [role, setRole]         = useState("");
  const [sleep, setSleep]       = useState("");
  const [score, setScore]       = useState(0);
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  function handleCalculate() {
    setScore(estimateScore(lastFelt, role, sleep));
    setStep(4);
  }

  async function handleFinish() {
    setLoading(true);
    setError("");
    try {
      const pending = JSON.parse(
        sessionStorage.getItem("overload-pending-register") ?? "{}"
      ) as { email?: string; password?: string; name?: string };

      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

      const result = await api.post<AuthResult>("/api/auth/register", {
        email: pending.email ?? "",
        password: pending.password ?? "",
        name: pending.name ?? "there",
        role,
        sleep_baseline: parseInt(sleep, 10),
        timezone: tz,
      });

      sessionStorage.removeItem("overload-pending-register");
      login(result);

      localStorage.setItem("overload-name", result.user.name);
      localStorage.setItem("overload-role", result.user.role);
      localStorage.setItem("overload-sleep", String(result.user.sleep_baseline));
      localStorage.setItem("overload-last-felt", lastFelt);

      setOnboardedCookie();
      router.push("/dashboard");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Registration failed. Please try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  const level = scoreLevel(score);
  const { headline, body } = step === 4
    ? getRevealContext(lastFelt, role, sleep)
    : { headline: "", body: "" };

  return (
    <div className="onb-page">
      <Link href="/" className="onb-logo">Over<em>load</em></Link>

      {/* Segmented progress bar — hidden on reveal step */}
      {step < 4 && (
        <div className="onb-progress-bar">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div
              key={i}
              className={[
                "onb-seg",
                i < step  ? "onb-seg--done"   : "",
                i === step ? "onb-seg--active" : "",
              ].join(" ")}
            />
          ))}
        </div>
      )}

      {/* ── Step 0 — Name ── */}
      {step === 0 && (
        <div className="onb-step" key="name">
          <div className="onb-eyebrow">Let&apos;s get to know you</div>
          <h1 className="onb-heading">What should I call you?</h1>
          <p className="onb-sub">We&apos;ll use this to personalise your experience.</p>
          <input
            className="onb-name-input"
            type="text"
            placeholder="Your first name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && name.trim() && setStep(1)}
            autoFocus
            maxLength={40}
          />
          <div className="onb-nav">
            <button
              className="onb-btn"
              disabled={!name.trim()}
              onClick={() => setStep(1)}
            >
              Continue →
            </button>
          </div>
        </div>
      )}

      {/* ── Step 1 — Opening question ── */}
      {step === 1 && (
        <div className="onb-step" key="opening">
          <div className="onb-eyebrow">One question first, {name}</div>
          <h1 className="onb-heading">When did you last feel like yourself at work?</h1>
          <p className="onb-sub">Fully rested, focused, and not behind.</p>
          <div className="onb-opening-options">
            {openingOptions.map((opt) => (
              <button
                key={opt.value}
                className={`onb-opening-option${lastFelt === opt.value ? " onb-opening-option--active" : ""}`}
                onClick={() => setLastFelt(opt.value)}
              >
                <span className="onb-opening-label">{opt.label}</span>
                <span className="onb-opening-sub">{opt.sub}</span>
              </button>
            ))}
          </div>
          <div className="onb-nav">
            <button className="onb-btn-back" onClick={() => setStep(0)}>← Back</button>
            <button
              className="onb-btn"
              disabled={!lastFelt}
              onClick={() => setStep(2)}
            >
              Continue →
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2 — Role ── */}
      {step === 2 && (
        <div className="onb-step" key="role">
          <div className="onb-eyebrow">Step 2 of 3</div>
          <h1 className="onb-heading">What&apos;s your role?</h1>
          <p className="onb-sub">
            An engineer and a manager have very different pressure patterns.
            This shapes how we read your signals.
          </p>
          <div className="onb-options">
            {roles.map((r) => (
              <button
                key={r.value}
                className={`onb-option${role === r.value ? " onb-option--active" : ""}`}
                onClick={() => setRole(r.value)}
              >
                <span className="onb-option-icon">{r.icon}</span>
                <span className="onb-option-label">{r.label}</span>
              </button>
            ))}
          </div>
          <div className="onb-nav">
            <button className="onb-btn-back" onClick={() => setStep(1)}>← Back</button>
            <button
              className="onb-btn"
              disabled={!role}
              onClick={() => setStep(3)}
            >
              Continue →
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3 — Sleep ── */}
      {step === 3 && (
        <div className="onb-step" key="sleep">
          <div className="onb-eyebrow">Step 3 of 3</div>
          <h1 className="onb-heading">How much sleep do you usually get?</h1>
          <p className="onb-sub">
            Sleep is the single strongest signal in your score.
            Every hour below your target adds weight.
          </p>
          <div className="onb-options onb-options--sleep">
            {sleepOptions.map((s) => (
              <button
                key={s.value}
                className={`onb-option onb-option--sleep${sleep === s.value ? " onb-option--active" : ""}`}
                onClick={() => setSleep(s.value)}
              >
                <span className="onb-option-icon">{s.icon}</span>
                <span className="onb-option-label">{s.label}</span>
                <span className="onb-option-sub">{s.sub}</span>
              </button>
            ))}
          </div>
          <div className="onb-nav">
            <button className="onb-btn-back" onClick={() => setStep(2)}>← Back</button>
            <button
              className="onb-btn"
              disabled={!sleep}
              onClick={handleCalculate}
            >
              Calculate my score →
            </button>
          </div>
        </div>
      )}

      {/* ── Step 4 — Score Reveal ── */}
      {step === 4 && (
        <div className="onb-reveal" key="reveal">
          <p className="onb-reveal-intro">Based on what you&apos;ve shared, {name}…</p>
          <h2 className="onb-reveal-heading">Your estimated starting point</h2>

          <div className="onb-reveal-gauge-wrap">
            <ScoreGauge score={score} />
            <div className="onb-reveal-score-center">
              <span className="onb-reveal-num" style={{ color: scoreColor(score) }}>
                <CountingScore target={score} />
              </span>
              <span className="onb-reveal-denom">/ 100</span>
            </div>
          </div>

          <div className={`onb-reveal-badge onb-reveal-badge--${level}`}>
            {scoreLabel(score)}
          </div>

          <div className={`onb-reveal-context onb-reveal-context--${level}`}>
            <p className="onb-reveal-context-headline">{headline}</p>
            <p className="onb-reveal-context-body">{body}</p>
          </div>

          {error && <div role="alert" className="auth-error">{error}</div>}

          <button className="onb-btn" onClick={handleFinish} disabled={loading}>
            {loading ? "Just a moment…" : "Let's start tracking →"}
          </button>

          <p className="onb-reveal-note">
            This score becomes more accurate as you check in each day.
          </p>
        </div>
      )}
    </div>
  );
}
