import { cookies } from "next/headers";
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

export async function POST() {
  const refreshToken = (await cookies()).get("overload-refresh")?.value;
  if (!refreshToken) {
    return NextResponse.json({ error: "missing refresh token" }, { status: 401 });
  }

  const upstream = await fetch(`${API_BASE}/api/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
    cache: "no-store",
  });

  const payload = await upstream.json();
  const clientPayload = { ...(payload as {
    refresh_token?: string;
    access_token?: string;
    error?: string;
  }) };
  delete clientPayload.refresh_token;
  const response = NextResponse.json(clientPayload, { status: upstream.status });
  if (upstream.ok && payload.refresh_token) {
    setRefreshCookie(response, payload.refresh_token);
  } else {
    response.cookies.delete("overload-refresh");
  }
  return response;
}
