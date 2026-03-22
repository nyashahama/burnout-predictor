// frontend/lib/auth.ts

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
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem("overload-name");
  localStorage.removeItem("overload-role");
  localStorage.removeItem("overload-sleep");
}

export function setSessionCookie() {
  document.cookie = "overload-session=1; path=/; max-age=2592000; SameSite=Lax";
}

export function setOnboardedCookie() {
  document.cookie = "overload-onboarded=1; path=/; max-age=2592000; SameSite=Lax";
}

export function clearSessionCookie() {
  document.cookie = "overload-session=; path=/; max-age=0; SameSite=Lax";
  document.cookie = "overload-onboarded=; path=/; max-age=0; SameSite=Lax";
}
