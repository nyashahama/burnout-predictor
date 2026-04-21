import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const API_BASE = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
const REFRESH_COOKIE = "overload-refresh";

export async function GET() {
  const refreshToken = (await cookies()).get(REFRESH_COOKIE)?.value;
  if (!refreshToken) {
    return NextResponse.json({ error: "missing refresh token" }, { status: 401 });
  }

  const refresh = await fetch(`${API_BASE}/api/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
    cache: "no-store",
  });
  const refreshPayload = await refresh.json();
  if (!refresh.ok || !refreshPayload.access_token) {
    const response = NextResponse.json({ error: "unauthorized" }, { status: 401 });
    response.cookies.delete(REFRESH_COOKIE);
    return response;
  }

  const upstream = await fetch(`${API_BASE}/api/dashboard/bootstrap`, {
    headers: { authorization: `Bearer ${refreshPayload.access_token}` },
    cache: "no-store",
  });

  const payload = await upstream.json();
  const response = NextResponse.json(payload, { status: upstream.status });
  if (refreshPayload.refresh_token) {
    response.cookies.set(REFRESH_COOKIE, refreshPayload.refresh_token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
  }
  return response;
}
