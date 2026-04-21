"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Copy, Mail, ShieldCheck, Check, Loader2 } from "lucide-react";
import { AppLogo } from "@/components/AppLogo";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { billingConfig, getEftReference, hasPublicEftDetails } from "@/lib/billing";
import { cn } from "@/lib/utils";
import type { InitPaymentResponse } from "@/lib/types";

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
  const { user, api } = useAuth();
  const [loading, setLoading] = useState(false);
  const [payment, setPayment] = useState<InitPaymentResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleInitiatePayment(planName: "pro" | "team") {
    if (!user) return;
    setLoading(true);
    setError(null);

    try {
      const result = await api.post<InitPaymentResponse>(
        "/api/payments/init",
        { plan_name: planName },
        (v) => v as InitPaymentResponse
      );
      setPayment(result);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to initiate payment");
      }
    } finally {
      setLoading(false);
    }
  }

  const reference = payment?.reference ?? getEftReference(user?.email);

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
                2. Pay via EFT using the reference below.
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
          {payment ? (
            <Card className="shadow-lg shadow-primary/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Check className="h-5 w-5 text-green-500" />
                  Payment initiated
                </CardTitle>
                <CardDescription>Use this reference when making your EFT transfer.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border border-border bg-muted/50 p-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Payment reference</div>
                  <div className="mt-2 break-all font-mono text-lg font-semibold text-foreground">{reference}</div>
                  <div className="mt-3">
                    <CopyButton label="reference" value={reference} />
                  </div>
                </div>

                <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm">
                  <div className="font-medium text-green-800">Amount to pay:</div>
                  <div className="text-2xl font-bold text-green-900">
                    R{(payment.amount_cents / 100).toFixed(2)} {payment.currency}
                  </div>
                </div>

                {hasPublicEftDetails ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border border-border p-4">
                      <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Account name</div>
                      <div className="mt-2 font-medium">{payment.bank_details.account_name}</div>
                    </div>
                    <div className="rounded-lg border border-border p-4">
                      <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Bank</div>
                      <div className="mt-2 font-medium">{payment.bank_details.bank_name}</div>
                    </div>
                    <div className="rounded-lg border border-border p-4">
                      <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Account number</div>
                      <div className="mt-2 font-medium">{payment.bank_details.account_number}</div>
                    </div>
                    <div className="rounded-lg border border-border p-4">
                      <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Branch code</div>
                      <div className="mt-2 font-medium">{payment.bank_details.branch_code}</div>
                    </div>
                    <div className="rounded-lg border border-border p-4">
                      <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Account type</div>
                      <div className="mt-2 font-medium">{payment.bank_details.account_type}</div>
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
                    EFT details are not configured yet.
                  </div>
                )}

                <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-sm">
                  <p className="font-medium text-amber-800">After making payment:</p>
                  <p className="mt-1 text-amber-700">
                    Email your proof of payment to {billingConfig.billingEmail || "the billing inbox"} with subject &quot;Overload Payment - {user?.email}&quot;.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="shadow-lg shadow-primary/5">
              <CardHeader>
                <CardTitle>Choose your plan</CardTitle>
                <CardDescription>Click to initiate your EFT payment</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {error && (
                  <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">
                    {error}
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <button
                    onClick={() => void handleInitiatePayment("pro")}
                    disabled={loading || !user}
                    className="flex flex-col items-start rounded-lg border-2 border-primary/20 p-4 text-left hover:border-primary/40 disabled:opacity-50"
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="font-semibold">{billingConfig.proPlanName}</span>
                      <span className="text-lg font-bold">{billingConfig.proPrice}</span>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">Monthly</p>
                    {loading ? (
                      <Loader2 className="mt-3 h-4 w-4 animate-spin" />
                    ) : (
                      <span className="mt-3 text-sm font-medium text-primary">Initiate payment →</span>
                    )}
                  </button>

                  <button
                    onClick={() => void handleInitiatePayment("team")}
                    disabled={loading || !user}
                    className="flex flex-col items-start rounded-lg border-2 border-border p-4 text-left hover:border-primary/40 disabled:opacity-50"
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="font-semibold">Team</span>
                      <span className="text-lg font-bold">R499</span>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">Monthly • 5 seats</p>
                    {loading ? (
                      <Loader2 className="mt-3 h-4 w-4 animate-spin" />
                    ) : (
                      <span className="mt-3 text-sm font-medium text-primary">Initiate payment →</span>
                    )}
                  </button>
                </div>

                {!user && (
                  <p className="text-sm text-muted-foreground">
                    <Link href="/login" className="text-primary hover:underline">Sign in</Link> or{" "}
                    <Link href="/login" className="text-primary hover:underline">create an account</Link> to upgrade.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

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
