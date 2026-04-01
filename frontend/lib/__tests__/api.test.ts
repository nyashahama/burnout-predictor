import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../vitest.setup";
import { ApiClient } from "../api";
import { parseUserResponse } from "../validators";

const BASE = "http://localhost:8080";

describe("ApiClient", () => {
  let client: ApiClient;

  beforeEach(() => {
    // Client with no token by default
    client = new ApiClient(BASE, () => null, () => {});
  });

  it("GET request returns parsed JSON", async () => {
    server.use(
      http.get(`${BASE}/api/score`, () =>
        HttpResponse.json({
          score: { score: 42, level: "warning", label: "Moderate load", signals: [] },
          has_checkin: true,
          streak: 3,
          daily_forecast: {
            score: 47,
            delta: 5,
            direction: "up",
            confidence: "medium",
            summary: "Tomorrow is likely to run about 5 points higher unless you reduce the load tonight.",
          },
          recommended_action: {
            title: "Protect tonight's sleep",
            detail: "Hard-stop work by 8 PM tonight.",
            driver: "sleep",
            confidence: "high",
          },
          trajectory: "stable",
          explanation: "",
          suggestion: "",
          accuracy_label: "",
        })
      )
    );
    const result = await client.get<{ score: { score: number }; has_checkin: boolean }>("/api/score");
    expect(result.score.score).toBe(42);
    expect(result.has_checkin).toBe(true);
  });

  it("POST request sends JSON body", async () => {
    let received: unknown;
    server.use(
      http.post(`${BASE}/api/checkins`, async ({ request }) => {
        received = await request.json();
        return HttpResponse.json({ check_in: {}, score: { score: 55 }, explanation: "", suggestion: "" });
      })
    );
    await client.post("/api/checkins", { stress: 3, note: "busy day" });
    expect(received).toEqual({ stress: 3, note: "busy day" });
  });

  it("PATCH request sends JSON body", async () => {
    let received: unknown;
    server.use(
      http.patch(`${BASE}/api/user`, async ({ request }) => {
        received = await request.json();
        return HttpResponse.json({ id: "1", name: "Updated" });
      })
    );
    await client.patch("/api/user", { name: "Updated" });
    expect(received).toEqual({ name: "Updated" });
  });

  it("throws ApiClientError on non-2xx response", async () => {
    server.use(
      http.get(`${BASE}/api/score`, () =>
        HttpResponse.json({ error: "unauthorized" }, { status: 401 })
      )
    );
    // No refresh token — onUnauthenticated fires, then error thrown
    let caught: unknown;
    try {
      await client.get("/api/score");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeDefined();
  });

  it("retries protected requests once after a 401 when refresh succeeds", async () => {
    let attempts = 0;
    let currentToken: string | null = "expired-token";

    server.use(
      http.get(`${BASE}/api/score`, ({ request }) => {
        attempts += 1;
        const authHeader = request.headers.get("Authorization");

        if (authHeader === "Bearer fresh-token") {
          return HttpResponse.json({
            score: { score: 42, level: "warning", label: "Moderate load", signals: [] },
            has_checkin: true,
            streak: 3,
            daily_forecast: {
              score: 47,
              delta: 5,
              direction: "up",
              confidence: "medium",
              summary: "Tomorrow is likely to run about 5 points higher unless you reduce the load tonight.",
            },
            recommended_action: {
              title: "Protect tonight's sleep",
              detail: "Hard-stop work by 8 PM tonight.",
              driver: "sleep",
              confidence: "high",
            },
            trajectory: "stable",
            explanation: "",
            suggestion: "",
            accuracy_label: "",
          });
        }

        return HttpResponse.json({ error: "expired" }, { status: 401 });
      })
    );

    const refreshAuth = vi.fn(async () => {
      currentToken = "fresh-token";
      return true;
    });

    const tokenClient = new ApiClient(BASE, () => currentToken, () => {}, refreshAuth);
    const result = await tokenClient.get<{ score: { score: number } }>("/api/score");

    expect(result.score.score).toBe(42);
    expect(attempts).toBe(2);
    expect(refreshAuth).toHaveBeenCalledTimes(1);
  });

  it("attaches Authorization Bearer header when token provided", async () => {
    let authHeader: string | null = null;
    server.use(
      http.get(`${BASE}/api/user`, ({ request }) => {
        authHeader = request.headers.get("Authorization");
        return HttpResponse.json({ id: "1", email: "a@b.com", name: "Alex" });
      })
    );
    const tokenClient = new ApiClient(BASE, () => "mytoken", () => {});
    await tokenClient.get("/api/user");
    expect(authHeader).toBe("Bearer mytoken");
  });

  it("does NOT attach Authorization header when token is null", async () => {
    let authHeader: string | null = "something";
    server.use(
      http.get(`${BASE}/api/health`, ({ request }) => {
        authHeader = request.headers.get("Authorization");
        return HttpResponse.json({ status: "ok" });
      })
    );
    await client.get("/api/health");
    expect(authHeader).toBeNull();
  });

  it("rejects malformed JSON when a validator is provided", async () => {
    server.use(
      http.get(`${BASE}/api/user`, () =>
        HttpResponse.json({ id: 1, name: "Alex" })
      )
    );

    await expect(client.get("/api/user", parseUserResponse)).rejects.toThrow(
      /invalid api response/i,
    );
  });
});
