import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { buttonVariants } from "@/components/ui/button";
import { CardDescription, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function NotFound() {
  return (
    <AuthShell>
      <div className="space-y-4">
        <CardTitle className="text-3xl">Page not found</CardTitle>
        <CardDescription className="text-base">
          The route you requested does not exist or has moved.
        </CardDescription>
        <Link href="/" className={cn(buttonVariants(), "w-full")}>
          Back to home
        </Link>
      </div>
    </AuthShell>
  );
}
