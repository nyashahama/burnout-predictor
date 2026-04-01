import { NextRequest, NextResponse } from "next/server";
import { createSignedValue } from "@/lib/session";
import { getSessionSecret } from "@/lib/session-secret";

const SESSION_MAX_AGE = 60 * 60 * 24 * 30;
const SESSION_COOKIE = "overload-session";
const ONBOARDED_COOKIE = "overload-onboarded";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { onboarded?: boolean };
  const response = NextResponse.json({ ok: true });
  const secret = getSessionSecret();

  const sessionValue = await createSignedValue("session", secret, SESSION_MAX_AGE);
  response.cookies.set(SESSION_COOKIE, sessionValue, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });

  if (body.onboarded) {
    const onboardedValue = await createSignedValue("onboarded", secret, SESSION_MAX_AGE);
    response.cookies.set(ONBOARDED_COOKIE, onboardedValue, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });
  } else {
    response.cookies.delete(ONBOARDED_COOKIE);
  }

  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(SESSION_COOKIE);
  response.cookies.delete(ONBOARDED_COOKIE);
  return response;
}
