"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const roles = [
  { value: "engineer",   label: "Software Engineer", icon: "💻" },
  { value: "pm",         label: "Product Manager",   icon: "📋" },
  { value: "designer",   label: "Designer",           icon: "🎨" },
  { value: "manager",    label: "Manager / Lead",     icon: "👥" },
  { value: "founder",    label: "Founder / Exec",     icon: "🚀" },
  { value: "other",      label: "Other",              icon: "📌" },
];

const sleepOptions = [
  { value: "6",  label: "6h or less", icon: "😴", sub: "Chronic deficit" },
  { value: "7",  label: "7 hours",    icon: "💤", sub: "Below ideal" },
  { value: "8",  label: "8 hours",    icon: "🌙", sub: "Sweet spot" },
  { value: "9",  label: "9h or more", icon: "⭐", sub: "Well rested" },
];

function setCookie(name: string, value: string, days = 7) {
  const maxAge = days * 24 * 60 * 60;
  document.cookie = `${name}=${value}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [sleep, setSleep] = useState("");

  const steps = ["Name", "Role", "Sleep"];

  function handleFinish() {
    localStorage.setItem("overload-name", name.trim() || "there");
    localStorage.setItem("overload-role", role);
    localStorage.setItem("overload-sleep", sleep);
    setCookie("overload-onboarded", "1");
    router.push("/dashboard");
  }

  return (
    <div className="onb-page">
      <Link href="/" className="onb-logo">
        Over<em>load</em>
      </Link>

      <div className="onb-progress">
        {steps.map((_, i) => (
          <div
            key={i}
            className={`onb-dot${i === step ? " onb-dot--active" : i < step ? " onb-dot--done" : ""}`}
          />
        ))}
      </div>

      {/* Step 0 — Name */}
      {step === 0 && (
        <div className="onb-step">
          <div className="onb-eyebrow">Step 1 of 3</div>
          <h1 className="onb-heading">What should we call you?</h1>
          <p className="onb-sub">
            This is how you&apos;ll appear in your dashboard.
          </p>
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

      {/* Step 1 — Role */}
      {step === 1 && (
        <div className="onb-step">
          <div className="onb-eyebrow">Step 2 of 3</div>
          <h1 className="onb-heading">What&apos;s your role?</h1>
          <p className="onb-sub">
            Helps us calibrate your cognitive load model.
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
            <button className="onb-btn-back" onClick={() => setStep(0)}>
              ← Back
            </button>
            <button
              className="onb-btn"
              disabled={!role}
              onClick={() => setStep(2)}
            >
              Continue →
            </button>
          </div>
        </div>
      )}

      {/* Step 2 — Sleep */}
      {step === 2 && (
        <div className="onb-step">
          <div className="onb-eyebrow">Step 3 of 3</div>
          <h1 className="onb-heading">How much sleep do you usually get?</h1>
          <p className="onb-sub">
            Your sleep baseline is the most important signal in your score.
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
            <button className="onb-btn-back" onClick={() => setStep(1)}>
              ← Back
            </button>
            <button
              className="onb-btn"
              disabled={!sleep}
              onClick={handleFinish}
            >
              Go to my dashboard →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
