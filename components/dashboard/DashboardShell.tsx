"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { mockUser } from "@/app/dashboard/data";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: "◎" },
  { href: "/dashboard/history", label: "History", icon: "⟳" },
  { href: "/dashboard/settings", label: "Settings", icon: "⊙" },
];

export default function DashboardShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="dash-shell">
      <aside className="dash-sidebar">
        <div className="dash-logo">
          Over<em>load</em>
        </div>

        <nav className="dash-nav">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`dash-nav-item${pathname === item.href ? " dash-nav-active" : ""}`}
            >
              <span className="dash-nav-icon">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="dash-sidebar-footer">
          <div className="dash-avatar">{mockUser.initials}</div>
          <div className="dash-user-info">
            <div className="dash-user-name">{mockUser.name}</div>
            <div className="dash-user-sub">{mockUser.streak}-day streak 🔥</div>
          </div>
        </div>
      </aside>

      <main className="dash-main">{children}</main>
    </div>
  );
}
