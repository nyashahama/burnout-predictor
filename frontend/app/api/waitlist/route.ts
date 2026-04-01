// app/api/waitlist/route.ts

import { NextRequest, NextResponse } from "next/server";

interface WaitlistBody {
  email: string;
  source?: string;
}

const RATE_LIMIT_MS = 60_000;
const RATE_LIMIT_COOKIE = "overload-waitlist-limit";

export async function POST(req: NextRequest) {
  const limitedUntil = Number.parseInt(req.cookies.get(RATE_LIMIT_COOKIE)?.value ?? "0", 10);
  if (!Number.isNaN(limitedUntil) && limitedUntil > Date.now()) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  // ── Guard: fail fast with a clear message if env vars are missing ──
  const apiKey = process.env.RESEND_API_KEY;
  const audienceId = process.env.RESEND_AUDIENCE_ID;

  if (!apiKey) {
    return NextResponse.json(
      { error: "Server misconfiguration: RESEND_API_KEY missing." },
      { status: 500 },
    );
  }
  if (!audienceId) {
    return NextResponse.json(
      { error: "Server misconfiguration: RESEND_AUDIENCE_ID missing." },
      { status: 500 },
    );
  }

  // ── Parse body ──────────────────────────────────────────────────
  let body: WaitlistBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 },
    );
  }

  const email = body.email?.trim().toLowerCase();
  const source = body.source ?? "unknown";

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { error: "Invalid email address." },
      { status: 400 },
    );
  }

  // ── 1. Add to Resend audience ───────────────────────────────────
  let resendStatus: number;

  try {
    const resendRes = await fetch(
      `https://api.resend.com/audiences/${audienceId}/contacts`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, unsubscribed: false }),
      },
    );

    resendStatus = resendRes.status;
    await resendRes.json().catch(() => null);

    if (resendStatus === 409) {
      // Already on list — silent success
      const response = NextResponse.json({ ok: true, duplicate: true });
      response.cookies.set(RATE_LIMIT_COOKIE, String(Date.now() + RATE_LIMIT_MS), {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: Math.ceil(RATE_LIMIT_MS / 1000),
      });
      return response;
    }

    if (!resendRes.ok) {
      return NextResponse.json(
        {
          error: `Resend rejected the request (${resendStatus}). Check your RESEND_AUDIENCE_ID and API key permissions.`,
        },
        { status: 500 },
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Could not reach Resend API. Check your internet/firewall." },
      { status: 500 },
    );
  }

  // ── 2. Ping yourself ────────────────────────────────────────────
  const ownerEmail = process.env.OWNER_EMAIL;
  if (ownerEmail) {
    try {
      const notifyRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM ?? "Overload <onboarding@resend.dev>",
          to: ownerEmail,
          subject: `🔴 New waitlist signup — ${email}`,
          html: `
            <p style="font-family:sans-serif;font-size:15px;">
              <strong>${email}</strong> just joined the Overload waitlist.<br/>
              <span style="color:#9a9080;font-size:13px;">
                Source: ${source} · ${new Date().toISOString()}
              </span>
            </p>
          `,
        }),
      });

      if (!notifyRes.ok) {
        await notifyRes.json().catch(() => null);
      }
    } catch {
      // Owner notification failure should not block waitlist signup.
    }
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(RATE_LIMIT_COOKIE, String(Date.now() + RATE_LIMIT_MS), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.ceil(RATE_LIMIT_MS / 1000),
  });
  return response;
}
