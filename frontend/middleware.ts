import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySignedValue } from "@/lib/session";
import { getSessionSecret } from "@/lib/session-secret";

export async function middleware(request: NextRequest) {
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

  // Protect dashboard: needs session + onboarding complete
  if (pathname.startsWith("/dashboard")) {
    if (!session) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    if (!onboarded) {
      return NextResponse.redirect(new URL("/onboarding", request.url));
    }
  }

  // Protect onboarding: needs session
  if (pathname === "/onboarding") {
    if (!session) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    if (onboarded) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  // Redirect already-authenticated users away from login
  if (pathname === "/login" && session && onboarded) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/onboarding", "/login"],
};
