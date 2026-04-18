import type { Metadata } from "next";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { AuthGuard } from "@/components/AuthGuard";

export const metadata: Metadata = {
  title: "Dashboard — Overload",
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <DashboardShell>{children}</DashboardShell>
    </AuthGuard>
  );
}
