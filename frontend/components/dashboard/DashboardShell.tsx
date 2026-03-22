"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";

const navItems = [
  { href: "/dashboard",          label: "Dashboard", icon: "◎" },
  { href: "/dashboard/history",  label: "History",   icon: "⟳" },
  { href: "/dashboard/weekly",   label: "Weekly",    icon: "◷" },
  { href: "/dashboard/settings", label: "Settings",  icon: "⊙" },
];

// ── Notification Manager ──────────────────────────────────────────────────────

/** Counts consecutive past days (not today) with stress ≥ 4 from localStorage. */
function getConsecutiveDanger(): number {
  let n = 0;
  const now = new Date();
  for (let i = 1; i <= 10; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const raw = localStorage.getItem(`checkin-${d.toISOString().split("T")[0]}`);
    if (!raw) break;
    try {
      const parsed = JSON.parse(raw);
      if (parsed.stress >= 4) n++;
      else break;
    } catch { break; }
  }
  return n;
}

/** Builds a context-aware notification body based on recent state. */
function buildNotifBody(): { title: string; body: string } {
  const now = new Date();
  const dow = now.getDay();
  const danger = getConsecutiveDanger();

  if (danger >= 3) {
    return {
      title: "Day 4 running high — Overload",
      body:  `${danger + 1} days in a row. You already know how you feel — 10 seconds to log it.`,
    };
  }
  if (danger >= 1) {
    return {
      title: "How are you carrying it today? — Overload",
      body:  "Yesterday was rough. Check in now — takes 10 seconds.",
    };
  }
  if (dow === 1) {
    return {
      title: "New week — Overload",
      body:  "Log today's read before the week gets away from you.",
    };
  }
  if (dow === 5) {
    return {
      title: "Last day of the week — Overload",
      body:  "Log today and protect the weekend.",
    };
  }
  return {
    title: "Time to check in — Overload",
    body:  "How are you carrying it today? Takes 10 seconds.",
  };
}

function NotificationManager({ hasCheckedIn }: { hasCheckedIn: boolean }) {
  const [showBanner, setShowBanner] = useState(false);
  const [bannerText, setBannerText] = useState("How are you carrying it today?");
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
    if (msUntil < 0 || msUntil > 24 * 60 * 60 * 1000) return;

    timerRef.current = setTimeout(() => {
      if (hasCheckedIn) return;

      const { title, body } = buildNotifBody();

      if ("Notification" in window && Notification.permission === "granted") {
        new Notification(title, { body, icon: "/favicon.ico" });
      }

      setBannerText(body);
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
      <span className="notif-banner-text">{bannerText}</span>
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
  const { user, logout } = useAuth();
  const [name,   setName]   = useState("");
  const [streak, setStreak] = useState(0);
  const [hasCheckedIn, setHasCheckedIn] = useState(false);

  useEffect(() => {
    const stored = user?.name ?? localStorage.getItem("overload-name") ?? "there";
    setName(stored);

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
  }, [user]);

  async function handleSignOut() {
    await logout();
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
          <button className="dash-signout" onClick={handleSignOut} title="Sign out">
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
        <button className="dash-bottom-item" onClick={handleSignOut}>
          <span className="dash-bottom-avatar">{initials}</span>
          <span className="dash-bottom-label">Sign out</span>
        </button>
      </nav>
    </div>
  );
}
