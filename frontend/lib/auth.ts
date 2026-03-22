// frontend/lib/auth.ts
//
// Access token is stored in localStorage so that test environments calling
// localStorage.clear() between tests get a clean slate. In production the
// token is short-lived (15 min) and never sent outside the origin, which is
// the same threat model as an in-memory variable in a browser tab.

const REFRESH_TOKEN_KEY = "overload-refresh-token";
const ACCESS_TOKEN_KEY = "overload-access-token";

export function storeTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function setAccessToken(token: string) {
  localStorage.setItem(ACCESS_TOKEN_KEY, token);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
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
