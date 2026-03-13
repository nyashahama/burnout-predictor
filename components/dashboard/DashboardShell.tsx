"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { mockUser } from "@/app/dashboard/data";

const navItems = [
  { href: "/dashboard",          label: "Dashboard", icon: "◎" },
  { href: "/dashboard/history",  label: "History",   icon: "⟳" },
  { href: "/dashboard/settings", label: "Settings",  icon: "⊙" },
];

function clearCookie(name: string) {
  document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;
}

export default function DashboardShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [name, setName] = useState(mockUser.name);

  useEffect(() => {
    const stored = localStorage.getItem("overload-name");
    if (stored) setName(stored);
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
            <div className="dash-user-sub">{mockUser.streak}-day streak 🔥</div>
          </div>
          <button className="dash-signout" onClick={signOut} title="Sign out">
            ⎋
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="dash-main">{children}</main>

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
