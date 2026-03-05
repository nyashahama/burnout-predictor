// app/api/waitlist/route.ts

import { NextRequest, NextResponse } from "next/server";

interface WaitlistBody {
  email: string;
  source?: string;
}

// Simple in-memory rate limit (1 submission per IP per minute)
const submissions = new Map<string, number>();
const RATE_LIMIT_MS = 60_000;

function isRateLimited(ip: string): boolean {
  const last = submissions.get(ip);
  if (!last) return false;
  return Date.now() - last < RATE_LIMIT_MS;
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  if (isRateLimited(ip)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  // ── Guard: fail fast with a clear message if env vars are missing ──
  const apiKey = process.env.RESEND_API_KEY;
  const audienceId = process.env.RESEND_AUDIENCE_ID;

  if (!apiKey) {
    console.error("[waitlist] RESEND_API_KEY is not set in .env.local");
    return NextResponse.json(
      { error: "Server misconfiguration: RESEND_API_KEY missing." },
      { status: 500 },
    );
  }
  if (!audienceId) {
    console.error("[waitlist] RESEND_AUDIENCE_ID is not set in .env.local");
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

  submissions.set(ip, Date.now());

  // ── 1. Add to Resend audience ───────────────────────────────────
  let resendStatus: number;
  let resendBody: unknown;

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
    resendBody = await resendRes.json().catch(() => null);

    console.log("[waitlist] Resend response:", resendStatus, resendBody);

    if (resendStatus === 409) {
      // Already on list — silent success
      return NextResponse.json({ ok: true, duplicate: true });
    }

    if (!resendRes.ok) {
      console.error("[waitlist] Resend error:", resendStatus, resendBody);
      return NextResponse.json(
        {
          error: `Resend rejected the request (${resendStatus}). Check your RESEND_AUDIENCE_ID and API key permissions.`,
        },
        { status: 500 },
      );
    }
  } catch (err) {
    console.error("[waitlist] Network error calling Resend:", err);
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
        const notifyBody = await notifyRes.json().catch(() => null);
        console.warn(
          "[waitlist] Owner notify failed:",
          notifyRes.status,
          notifyBody,
        );
      }
    } catch (err) {
      console.warn("[waitlist] Owner notify network error:", err);
    }
  }

  return NextResponse.json({ ok: true });
}
