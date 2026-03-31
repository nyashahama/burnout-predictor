"use client";

import { AuthShell } from "@/components/AuthShell";
import { Button } from "@/components/ui/button";
import { CardDescription, CardTitle } from "@/components/ui/card";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <AuthShell>
      <div className="space-y-4">
        <CardTitle className="text-3xl">Something broke</CardTitle>
        <CardDescription className="text-base">
          An unexpected error interrupted this page. Try the action again.
        </CardDescription>
        <Button onClick={reset}>
          Try again
        </Button>
        <p className="text-xs text-muted-foreground">{error.message}</p>
      </div>
    </AuthShell>
  );
}
