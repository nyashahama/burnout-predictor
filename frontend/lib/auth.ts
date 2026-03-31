// frontend/lib/auth.ts
import { clearAppStorage } from "./storage";

const REFRESH_TOKEN_KEY = "overload-refresh-token";

/** In-memory access token — NOT persisted to storage. XSS cannot access this. */
let _accessToken: string | null = null;

export function storeTokens(accessToken: string, refreshToken: string) {
  _accessToken = accessToken;
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function getAccessToken(): string | null {
  return _accessToken;
}

export function setAccessToken(token: string) {
  _accessToken = token;
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function clearTokens() {
  _accessToken = null;
  clearAppStorage();
  localStorage.removeItem(REFRESH_TOKEN_KEY);
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
