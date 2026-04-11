"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, X, Loader2 } from "lucide-react";
import { AppLogo } from "@/components/AppLogo";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import type { PendingPayment } from "@/lib/types";

export default function AdminPaymentsPage() {
  const { user, api } = useAuth();
  const [payments, setPayments] = useState<PendingPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState<string | null>(null);

  async function fetchPayments() {
    try {
      const result = await api.get<{ payments: PendingPayment[] }>(
        "/api/admin/payments",
        (v) => v as { payments: PendingPayment[] }
      );
      setPayments(result.payments);
    } catch {
      setError("Failed to load payments");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (user) {
      void fetchPayments();
    }
  }, [user]);

  async function handleVerify(paymentId: string, action: "approve" | "reject") {
    setVerifying(paymentId);
    try {
      await api.post(`/api/admin/payments/${paymentId}/verify`, { action, note: "" });
      await fetchPayments();
    } catch {
      setError(`Failed to ${action} payment`);
    } finally {
      setVerifying(null);
    }
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center">
        <p>Loading...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border/80 bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <AppLogo />
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className={buttonVariants({ variant: "ghost" })}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to dashboard
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <h1 className="text-3xl font-bold">Pending EFT Payments</h1>
        <p className="mt-2 text-muted-foreground">
          Verify payments and activate subscriptions
        </p>

        {error && (
          <div className="mt-4 rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="mt-8 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : payments.length === 0 ? (
          <Card className="mt-8">
            <CardContent className="py-12 text-center text-muted-foreground">
              No pending payments to verify.
            </CardContent>
          </Card>
        ) : (
          <div className="mt-8 space-y-4">
            {payments.map((payment) => (
              <Card key={payment.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="font-mono text-lg">{payment.reference}</CardTitle>
                      <CardDescription className="mt-1">
                        {payment.user_name} ({payment.user_email})
                      </CardDescription>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold">
                        R{(payment.amount_cents / 100).toFixed(2)}
                      </div>
                      <div className="text-sm text-muted-foreground">{payment.plan_name.toUpperCase()}</div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-muted-foreground">
                      Created: {new Date(payment.created_at).toLocaleString()}
                      <br />
                      Expires: {new Date(payment.expires_at).toLocaleString()}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => void handleVerify(payment.id, "reject")}
                        disabled={verifying === payment.id}
                        className="inline-flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                      >
                        <X className="h-4 w-4" />
                        Reject
                      </button>
                      <button
                        onClick={() => void handleVerify(payment.id, "approve")}
                        disabled={verifying === payment.id}
                        className="inline-flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-100 disabled:opacity-50"
                      >
                        <Check className="h-4 w-4" />
                        Approve & Upgrade
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
