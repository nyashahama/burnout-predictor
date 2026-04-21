// app/api/auth/logout/route.ts

import { NextResponse } from "next/server";

const REFRESH_COOKIE = "overload-refresh";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(REFRESH_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}