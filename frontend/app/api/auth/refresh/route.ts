// app/api/auth/refresh/route.ts

import { NextRequest, NextResponse } from "next/server";
import { parseRefreshResult } from "@/lib/validators";

const API_BASE = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
const REFRESH_COOKIE = "overload-refresh";

function setRefreshCookie(response: NextResponse, token: string) {
  response.cookies.set(REFRESH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function GET(req: NextRequest) {
  const refreshToken = req.cookies.get(REFRESH_COOKIE)?.value;

  if (!refreshToken) {
    return NextResponse.json({ error: "No refresh token." }, { status: 401 });
  }

  const backendRes = await fetch(`${API_BASE}/api/auth/refresh`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${refreshToken}`,
    },
  });

  const data = await backendRes.json();

  if (!backendRes.ok) {
    return NextResponse.json(data, { status: backendRes.status });
  }

  const tokens = parseRefreshResult(data);
  const response = NextResponse.json({ access_token: tokens.access_token });
  setRefreshCookie(response, tokens.refresh_token);
  return response;
}