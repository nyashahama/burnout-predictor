import Link from "next/link";
import { cn } from "@/lib/utils";

export function AppLogo({
  href = "/",
  className,
}: {
  href?: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn("font-serif text-2xl tracking-tight text-foreground", className)}
    >
      Over<span className="italic text-primary">load</span>
    </Link>
  );
}
