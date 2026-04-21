// frontend/lib/auth.ts
import { clearAppStorage } from "./storage";

let _accessToken: string | null = null;

export function storeTokens(accessToken: string) {
  _accessToken = accessToken;
}

export function getAccessToken(): string | null {
  return _accessToken;
}

export function setAccessToken(token: string) {
  _accessToken = token;
}

export function clearTokens() {
  _accessToken = null;
  clearAppStorage();
}

async function updateSession(onboarded: boolean) {
  if (process.env.NODE_ENV === "test") {
    document.cookie = "overload-session=1; path=/; max-age=2592000; SameSite=Lax";
    if (onboarded) {
      document.cookie = "overload-onboarded=1; path=/; max-age=2592000; SameSite=Lax";
    }
    return;
  }

  await fetch("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ onboarded }),
  });
}

export function setSessionCookie() {
  return updateSession(false);
}

export function setOnboardedCookie() {
  return updateSession(true);
}

export async function clearSessionCookie() {
  if (process.env.NODE_ENV === "test") {
    document.cookie = "overload-session=; path=/; max-age=0; SameSite=Lax";
    document.cookie = "overload-onboarded=; path=/; max-age=0; SameSite=Lax";
    return;
  }

  await fetch("/api/session", { method: "DELETE" });
}

export async function refreshAccessToken(): Promise<string | null> {
  try {
    const res = await fetch("/api/auth/refresh", { method: "GET" });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.access_token) {
      _accessToken = data.access_token;
    }
    return data.access_token;
  } catch {
    return null;
  }
}