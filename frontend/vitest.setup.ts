import "@testing-library/jest-dom";
import { afterAll, afterEach, beforeAll } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";

export const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

server.use(
  http.get("/api/user", () =>
    HttpResponse.json({
      id: "u1",
      email: "test@example.com",
      name: "Test User",
      role: "engineer",
      sleep_baseline: 8,
      timezone: "UTC",
      email_verified: true,
      tier: "free",
      calendar_connected: false,
    })
  ),
  http.post("/api/auth/refresh", () =>
    HttpResponse.json({ access_token: "at-fresh", refresh_token: "rt-fresh" })
  ),
  http.post("/api/auth/register", () =>
    HttpResponse.json({
      access_token: "at-test",
      refresh_token: "rt-test",
      user: {
        id: "u1",
        email: "test@example.com",
        name: "Test User",
        role: "engineer",
        sleep_baseline: 8,
        timezone: "UTC",
        email_verified: true,
        tier: "free",
        calendar_connected: false,
        onboarded: false,
      },
    })
  ),
  http.post("/api/auth/login", () =>
    HttpResponse.json({
      access_token: "at-test",
      refresh_token: "rt-test",
      user: {
        id: "u1",
        email: "test@example.com",
        name: "Test User",
        role: "engineer",
        sleep_baseline: 8,
        timezone: "UTC",
        email_verified: true,
        tier: "free",
        calendar_connected: false,
        onboarded: false,
      },
    })
  ),
  http.post("/api/user/onboarding", () =>
    HttpResponse.json({
      id: "u1",
      email: "test@example.com",
      name: "Test User",
      role: "engineer",
      sleep_baseline: 8,
      timezone: "UTC",
      email_verified: true,
      tier: "free",
      calendar_connected: false,
      onboarded: true,
    })
  )
);