"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BarChart3, CalendarDays, LayoutDashboard, LogOut, Settings } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardDataProvider, useDashboardData } from "@/contexts/DashboardDataContext";
import { AppLogo } from "@/components/AppLogo";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/history", label: "History", icon: BarChart3 },
  { href: "/dashboard/weekly", label: "Weekly", icon: CalendarDays },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

function DashboardShellFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { scoreCard } = useDashboardData();
  const storageName = typeof window !== "undefined" ? localStorage.getItem("overload-name") : null;

  const displayName = user?.name ?? storageName ?? "there";
  const streak = scoreCard?.streak ?? 0;

  async function handleSignOut() {
    await logout();
    router.push("/");
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="mx-auto grid min-h-screen max-w-7xl lg:grid-cols-[260px_1fr]">
        <aside className="hidden border-r border-border bg-background lg:flex lg:flex-col">
          <div className="flex h-16 items-center px-6">
            <AppLogo href="/dashboard" />
          </div>
          <nav className="flex-1 space-y-2 px-4 py-4">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                prefetch={false}
                aria-current={pathname === item.href ? "page" : undefined}
                className={cn(
                  buttonVariants({ variant: pathname === item.href ? "secondary" : "ghost" }),
                  "w-full justify-start",
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="space-y-4 border-t border-border p-4">
            <div>
              <div className="text-sm font-medium">{displayName}</div>
              <div className="text-xs text-muted-foreground">
                {streak > 0 ? `${streak}-day streak` : "No streak yet"}
              </div>
            </div>
            <Button variant="outline" className="w-full justify-start" onClick={handleSignOut}>
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          </div>
        </aside>

        <div className="flex min-h-screen flex-col">
          <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-background/95 px-4 py-4 backdrop-blur lg:hidden">
            <AppLogo href="/dashboard" />
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          </header>

          <main className="flex-1 px-4 py-6 sm:px-6">{children}</main>

          <nav className="sticky bottom-0 grid grid-cols-4 border-t border-border bg-background p-2 lg:hidden">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                prefetch={false}
                className={cn(
                  "flex flex-col items-center rounded-lg px-2 py-2 text-xs",
                  pathname === item.href ? "bg-secondary text-foreground" : "text-muted-foreground",
                )}
              >
                <item.icon className="mb-1 h-4 w-4" />
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </div>
  );
}

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <DashboardDataProvider>
      <DashboardShellFrame>{children}</DashboardShellFrame>
    </DashboardDataProvider>
  );
}
