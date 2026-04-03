"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Copy, Mail, ShieldCheck } from "lucide-react";
import { AppLogo } from "@/components/AppLogo";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { billingConfig, getEftReference, hasPublicEftDetails } from "@/lib/billing";
import { cn } from "@/lib/utils";

function CopyButton({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent"
      aria-label={`Copy ${label}`}
    >
      <Copy className="h-4 w-4" />
      {copied ? "Copied" : `Copy ${label}`}
    </button>
  );
}

export default function UpgradePage() {
  const { user } = useAuth();
  const reference = getEftReference(user?.email);

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border/80 bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <AppLogo />
          <div className="flex items-center gap-3">
            <Link href="/" className={buttonVariants({ variant: "ghost" })}>
              Home
            </Link>
            <Link href={user ? "/dashboard/settings" : "/login"} className={buttonVariants()}>
              {user ? "Back to settings" : "Create account"}
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-6 px-4 py-16 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
        <div className="space-y-6">
          <Badge variant="secondary" className="rounded-full px-4 py-1 text-xs uppercase tracking-[0.18em]">
            South Africa EFT launch
          </Badge>
          <div className="space-y-4">
            <h1 className="max-w-3xl text-4xl leading-tight tracking-tight sm:text-5xl">
              Upgrade with EFT while card payments are still pending.
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
              You can start on the free plan immediately, then pay for {billingConfig.proPlanName} by bank transfer.
              Once proof of payment lands, access is upgraded manually {billingConfig.processingTime}.
            </p>
          </div>

          <Card className="border-primary/20 bg-primary/5">
            <CardHeader>
              <CardTitle>What to do</CardTitle>
              <CardDescription>The interim flow is manual, but it is simple and launchable now.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              <div className="rounded-lg border border-border bg-background px-4 py-3">
                1. Create your Overload account.
              </div>
              <div className="rounded-lg border border-border bg-background px-4 py-3">
                2. Pay <span className="font-semibold text-foreground">{billingConfig.proPrice}</span> via EFT using the reference below.
              </div>
              <div className="rounded-lg border border-border bg-background px-4 py-3">
                3. Email your proof of payment to{" "}
                <span className="font-medium text-foreground">{billingConfig.billingEmail || "your billing inbox"}</span>.
              </div>
              <div className="rounded-lg border border-border bg-background px-4 py-3">
                4. You get upgraded to <span className="font-medium text-foreground">{billingConfig.proPlanName}</span> manually after confirmation.
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="shadow-lg shadow-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-3">
                <span>{billingConfig.proPlanName}</span>
                <span className="text-2xl">{billingConfig.proPrice}</span>
              </CardTitle>
              <CardDescription>Use this reference so you can be matched to the right account quickly.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/50 p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Payment reference</div>
                <div className="mt-2 break-all font-mono text-lg font-semibold text-foreground">{reference}</div>
                <div className="mt-3">
                  <CopyButton label="reference" value={reference} />
                </div>
              </div>

              {hasPublicEftDetails ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-border p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Account name</div>
                    <div className="mt-2 font-medium">{billingConfig.accountName}</div>
                  </div>
                  <div className="rounded-lg border border-border p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Bank</div>
                    <div className="mt-2 font-medium">{billingConfig.bankName}</div>
                  </div>
                  <div className="rounded-lg border border-border p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Account number</div>
                    <div className="mt-2 font-medium">{billingConfig.accountNumber}</div>
                  </div>
                  <div className="rounded-lg border border-border p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Branch code</div>
                    <div className="mt-2 font-medium">{billingConfig.branchCode || "Use your bank default"}</div>
                  </div>
                  <div className="rounded-lg border border-border p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Account type</div>
                    <div className="mt-2 font-medium">{billingConfig.accountType || "Business account"}</div>
                  </div>
                  <div className="rounded-lg border border-border p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Proof of payment</div>
                    <div className="mt-2 flex items-center gap-2 font-medium">
                      <Mail className="h-4 w-4 text-primary" />
                      {billingConfig.billingEmail}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                  EFT details are not configured yet. Set the public billing environment variables before sending customers here.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                Access and timing
              </CardTitle>
              <CardDescription>Keep expectations explicit while the processor approval is still outstanding.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>Free accounts work immediately. EFT upgrades are applied after payment verification.</p>
              <p>Use the same email for your Overload account and your proof-of-payment email whenever possible.</p>
              <p>If you already have an account, you can also find these instructions again in settings.</p>
              <div className="pt-2">
                <Link
                  href={user ? "/dashboard/settings" : "/login"}
                  className={cn(buttonVariants({ size: "lg" }), "gap-2")}
                >
                  {user ? "Open billing settings" : "Create account first"}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}
