import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySignedValue } from "@/lib/session";
import { getSessionSecret } from "@/lib/session-secret";

export async function proxy(request: NextRequest) {
  const secret = getSessionSecret();
  const session = await verifySignedValue(
    request.cookies.get("overload-session")?.value,
    "session",
    secret,
  );
  const onboarded = await verifySignedValue(
    request.cookies.get("overload-onboarded")?.value,
    "onboarded",
    secret,
  );
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/dashboard")) {
    if (!session) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    if (!onboarded) {
      return NextResponse.redirect(new URL("/onboarding", request.url));
    }
  }

  if (pathname === "/onboarding") {
    if (!session) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    if (onboarded) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  if (pathname === "/login" && session && onboarded) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/onboarding", "/login"],
};
