"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { buttonVariants } from "@/components/ui/button";
import { CardDescription, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
type State = "loading" | "success" | "error";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [state, setState] = useState<State>(token ? "loading" : "error");

  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE}/api/auth/verify-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then((res) => setState(res.ok ? "success" : "error"))
      .catch(() => setState("error"));
  }, [token]);

  if (state === "loading") {
    return (
      <div className="space-y-2">
        <CardTitle className="text-3xl">Verifying your email…</CardTitle>
        <CardDescription className="text-base">This will only take a moment.</CardDescription>
      </div>
    );
  }

  if (state === "success") {
    return (
      <div className="space-y-4">
        <CardTitle className="text-3xl">Email verified</CardTitle>
        <CardDescription className="text-base">Your address is confirmed. You&apos;re good to go.</CardDescription>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">
          Your email has been verified successfully.
        </div>
        <Link href="/login" className={cn(buttonVariants(), "w-full")}>Sign in →</Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <CardTitle className="text-3xl">Link expired</CardTitle>
      <CardDescription className="text-base">This verification link is invalid or has already been used.</CardDescription>
      <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
        Verification links expire after 24 hours. Request a new one from your dashboard.
      </div>
      <Link href="/login" className={cn(buttonVariants(), "w-full")}>Back to sign in</Link>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <AuthShell>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Verifying your email…</p>}>
        <VerifyEmailContent />
      </Suspense>
    </AuthShell>
  );
}
