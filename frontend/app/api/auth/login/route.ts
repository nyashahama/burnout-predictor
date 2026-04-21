import { NextResponse } from "next/server";

const API_BASE = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

const REFRESH_COOKIE = "overload-refresh";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

function setRefreshCookie(response: NextResponse, token: string) {
  response.cookies.set(REFRESH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
}

export async function POST(request: Request) {
  const body = await request.json();
  const upstream = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const payload = await upstream.json();
  const clientPayload = { ...(payload as {
    refresh_token?: string;
    access_token?: string;
    user?: unknown;
    error?: string;
  }) };
  delete clientPayload.refresh_token;
  const response = NextResponse.json(clientPayload, { status: upstream.status });
  if (upstream.ok && payload.refresh_token) {
    setRefreshCookie(response, payload.refresh_token);
  }
  return response;
}
