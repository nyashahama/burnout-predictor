"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { mockUser } from "@/app/dashboard/data";

const navItems = [
  { href: "/dashboard",          label: "Dashboard", icon: "◎" },
  { href: "/dashboard/history",  label: "History",   icon: "⟳" },
  { href: "/dashboard/weekly",   label: "Weekly",    icon: "◷" },
  { href: "/dashboard/settings", label: "Settings",  icon: "⊙" },
];

function clearCookie(name: string) {
  document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;
}

// ── Notification Manager ──────────────────────────────────────────────────────

function NotificationManager({ hasCheckedIn }: { hasCheckedIn: boolean }) {
  const [showBanner, setShowBanner] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const enabled  = localStorage.getItem("overload-notif-enabled") === "1";
    const timeStr  = localStorage.getItem("overload-notif-time") || "17:30";
    if (!enabled) return;

    const [hStr, mStr] = timeStr.split(":");
    const h = parseInt(hStr, 10);
    const m = parseInt(mStr, 10);

    const now = new Date();
    const target = new Date(now);
    target.setHours(h, m, 0, 0);

    const msUntil = target.getTime() - now.getTime();
    if (msUntil < 0 || msUntil > 24 * 60 * 60 * 1000) return; // not today or already passed

    timerRef.current = setTimeout(() => {
      if (hasCheckedIn) return; // already checked in — skip

      // Browser notification
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification("Time to check in — Overload", {
          body: "How's your stress level today? Log it now to keep your streak.",
          icon: "/favicon.ico",
        });
      }

      // In-app banner
      setShowBanner(true);
    }, msUntil);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [hasCheckedIn]);

  if (!showBanner || hasCheckedIn) return null;

  return (
    <div className="notif-banner">
      <span className="notif-banner-icon">🔔</span>
      <span className="notif-banner-text">
        Time to check in — how&apos;s your stress level today?
      </span>
      <Link href="/dashboard" className="notif-banner-action">Check in</Link>
      <button className="notif-banner-close" onClick={() => setShowBanner(false)}>✕</button>
    </div>
  );
}

// ── Weekly Prompt (Monday morning) ────────────────────────────────────────────

function WeeklyPrompt() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const weeklySummaryEnabled = localStorage.getItem("overload-weekly-summary") !== "0";
    if (!weeklySummaryEnabled) return;

    const now = new Date();
    const isMonday = now.getDay() === 1;
    const isMorning = now.getHours() >= 7 && now.getHours() < 12;
    if (!isMonday || !isMorning) return;

    const dismissKey = `weekly-dismissed-${now.toISOString().split("T")[0]}`;
    if (localStorage.getItem(dismissKey)) return;

    setShow(true);
  }, []);

  function dismiss() {
    const now = new Date();
    localStorage.setItem(`weekly-dismissed-${now.toISOString().split("T")[0]}`, "1");
    setShow(false);
  }

  if (!show) return null;

  return (
    <div className="weekly-prompt">
      <div className="weekly-prompt-left">
        <span className="weekly-prompt-icon">◷</span>
        <div>
          <div className="weekly-prompt-title">Your weekly debrief is ready</div>
          <div className="weekly-prompt-sub">Monday morning — review last week&apos;s load patterns</div>
        </div>
      </div>
      <div className="weekly-prompt-actions">
        <Link href="/dashboard/weekly" className="weekly-prompt-btn">View summary</Link>
        <button className="weekly-prompt-dismiss" onClick={dismiss}>Later</button>
      </div>
    </div>
  );
}

// ── Shell ─────────────────────────────────────────────────────────────────────

export default function DashboardShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [name,   setName]   = useState(mockUser.name);
  const [streak, setStreak] = useState(mockUser.streak);
  const [hasCheckedIn, setHasCheckedIn] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("overload-name");
    if (stored) setName(stored);

    // Compute real streak from check-ins
    let s = 0;
    const now = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = `checkin-${d.toISOString().split("T")[0]}`;
      if (localStorage.getItem(key)) s++;
      else break;
    }
    setStreak(s);

    // Check if user checked in today
    const todayKey = `checkin-${now.toISOString().split("T")[0]}`;
    setHasCheckedIn(!!localStorage.getItem(todayKey));
  }, []);

  function signOut() {
    clearCookie("overload-session");
    clearCookie("overload-onboarded");
    router.push("/");
  }

  const initials = name.trim()[0]?.toUpperCase() ?? "?";

  return (
    <div className="dash-shell">
      {/* ── Sidebar (desktop + tablet) ── */}
      <aside className="dash-sidebar">
        <div className="dash-logo">
          <span className="dash-logo-full">Over<em>load</em></span>
          <span className="dash-logo-mark">O<em>l</em></span>
        </div>

        <nav className="dash-nav">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`dash-nav-item${pathname === item.href ? " dash-nav-active" : ""}`}
              title={item.label}
            >
              <span className="dash-nav-icon">{item.icon}</span>
              <span className="dash-nav-label">{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="dash-sidebar-footer">
          <div className="dash-avatar">{initials}</div>
          <div className="dash-user-info">
            <div className="dash-user-name">{name}</div>
            <div className={`dash-user-sub${streak > 0 ? " dash-user-sub--streak" : ""}`}>
              {streak > 0 ? `🔥 ${streak}-day streak` : "No streak yet"}
            </div>
          </div>
          <button className="dash-signout" onClick={signOut} title="Sign out">
            ⎋
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="dash-main">
        <WeeklyPrompt />
        <NotificationManager hasCheckedIn={hasCheckedIn} />
        {children}
      </main>

      {/* ── Bottom nav (mobile only) ── */}
      <nav className="dash-bottom-nav" aria-label="Main navigation">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`dash-bottom-item${pathname === item.href ? " dash-bottom-active" : ""}`}
          >
            <span className="dash-bottom-icon">{item.icon}</span>
            <span className="dash-bottom-label">{item.label}</span>
          </Link>
        ))}
        <button className="dash-bottom-item" onClick={signOut}>
          <span className="dash-bottom-avatar">{initials}</span>
          <span className="dash-bottom-label">Sign out</span>
        </button>
      </nav>
    </div>
  );
}
