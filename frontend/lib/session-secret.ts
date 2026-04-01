const DEV_FALLBACK_SECRET = "local-dev-session-secret";

export function getSessionSecret(): string {
  const configured = process.env.SESSION_COOKIE_SECRET;
  if (configured) {
    return configured;
  }

  if (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") {
    return DEV_FALLBACK_SECRET;
  }

  throw new Error("SESSION_COOKIE_SECRET must be set outside development and test.");
}
