/**
 * Tests for AuthContext: AuthProvider + useAuth hook.
 *
 * TDD: these tests are written BEFORE AuthContext.tsx exists.
 */
import React from "react";
import { render, screen, act, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../vitest.setup";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeUser(overrides: Partial<ReturnType<typeof _makeUser>> = {}) {
  return _makeUser(overrides);
}
function _makeUser(overrides = {}) {
  return {
    id: "u1",
    email: "test@example.com",
    name: "Test User",
    role: "engineer",
    sleep_baseline: 7,
    timezone: "UTC",
    email_verified: true,
    tier: "free",
    calendar_connected: false,
    ...overrides,
  };
}

function makeAuthResult(overrides: Record<string, unknown> = {}) {
  return {
    access_token: "at-abc",
    refresh_token: "rt-xyz",
    user: makeUser(),
    ...overrides,
  };
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe("useAuth", () => {
  it("throws when used outside AuthProvider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    function Bad() {
      useAuth();
      return null;
    }

    expect(() => render(<Bad />)).toThrow(
      "useAuth must be used inside <AuthProvider>"
    );

    spy.mockRestore();
  });
});

describe("AuthProvider", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("resolves to no-user when no refresh token exists", async () => {
    function ConsumerLocal() {
      const { user, isLoading } = useAuth();
      if (isLoading) return <div>loading</div>;
      return <div>{user ? `user:${user.name}` : "no-user"}</div>;
    }

    render(
      <AuthProvider>
        <ConsumerLocal />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.queryByText("loading")).not.toBeInTheDocument();
    });

    expect(screen.getByText("no-user")).toBeInTheDocument();
  });

  it("login sets user and stores tokens in localStorage", async () => {
    let capturedLogin: ((r: ReturnType<typeof makeAuthResult>) => void) | null =
      null;
    let capturedUser: ReturnType<typeof makeUser> | null = null;

    function ConsumerLocal() {
      const { user, login, isLoading } = useAuth();
      capturedLogin = login;
      capturedUser = user;
      if (isLoading) return <div>loading</div>;
      return <div>{user ? `user:${user.name}` : "no-user"}</div>;
    }

    render(
      <AuthProvider>
        <ConsumerLocal />
      </AuthProvider>
    );

    await waitFor(() =>
      expect(screen.queryByText("loading")).not.toBeInTheDocument()
    );

    const result = makeAuthResult();
    await act(async () => {
      capturedLogin!(result);
    });

    expect(capturedUser).not.toBeNull();
    expect(capturedUser!.name).toBe("Test User");
    expect(localStorage.getItem("overload-refresh-token")).toBe("rt-xyz");
  });

  it("logout clears user and tokens", async () => {
    server.use(
      http.post("http://localhost:8080/api/auth/logout", () =>
        HttpResponse.json({}, { status: 200 })
      )
    );

    let capturedLogin: ((r: ReturnType<typeof makeAuthResult>) => void) | null =
      null;
    let capturedLogout: (() => Promise<void>) | null = null;
    let capturedUser: ReturnType<typeof makeUser> | null | undefined =
      undefined;

    function ConsumerLocal() {
      const { user, login, logout, isLoading } = useAuth();
      capturedLogin = login;
      capturedLogout = logout;
      capturedUser = user;
      if (isLoading) return <div>loading</div>;
      return <div>{user ? `user:${user.name}` : "no-user"}</div>;
    }

    render(
      <AuthProvider>
        <ConsumerLocal />
      </AuthProvider>
    );

    await waitFor(() =>
      expect(screen.queryByText("loading")).not.toBeInTheDocument()
    );

    // Log in first
    await act(async () => {
      capturedLogin!(makeAuthResult());
    });
    expect(capturedUser!.name).toBe("Test User");

    // Now log out
    await act(async () => {
      await capturedLogout!();
    });

    expect(capturedUser).toBeNull();
    expect(localStorage.getItem("overload-refresh-token")).toBeNull();
  });

  it("refreshSession returns false when no refresh token stored", async () => {
    let capturedRefresh: (() => Promise<boolean>) | null = null;

    function ConsumerLocal() {
      const { refreshSession, isLoading } = useAuth();
      capturedRefresh = refreshSession;
      if (isLoading) return <div>loading</div>;
      return <div>ready</div>;
    }

    render(
      <AuthProvider>
        <ConsumerLocal />
      </AuthProvider>
    );

    await waitFor(() =>
      expect(screen.queryByText("loading")).not.toBeInTheDocument()
    );

    const result = await capturedRefresh!();
    expect(result).toBe(false);
  });

  it("refreshSession returns true on valid server response", async () => {
    localStorage.setItem("overload-refresh-token", "rt-old");

    // The on-mount restore will also fire — handle its requests
    server.use(
      http.post("http://localhost:8080/api/auth/refresh", () =>
        HttpResponse.json({
          access_token: "at-new",
          refresh_token: "rt-new",
        })
      ),
      http.get("http://localhost:8080/api/user", () =>
        HttpResponse.json(makeUser())
      )
    );

    let capturedRefresh: (() => Promise<boolean>) | null = null;

    function ConsumerLocal() {
      const { refreshSession, isLoading } = useAuth();
      capturedRefresh = refreshSession;
      if (isLoading) return <div>loading</div>;
      return <div>ready</div>;
    }

    render(
      <AuthProvider>
        <ConsumerLocal />
      </AuthProvider>
    );

    await waitFor(() =>
      expect(screen.queryByText("loading")).not.toBeInTheDocument()
    );

    const result = await act(async () => capturedRefresh!());
    expect(result).toBe(true);
  });

  it("restores session on mount when refresh token and user endpoint succeed", async () => {
    localStorage.setItem("overload-refresh-token", "rt-stored");

    server.use(
      http.post("http://localhost:8080/api/auth/refresh", () =>
        HttpResponse.json({
          access_token: "at-restored",
          refresh_token: "rt-stored",
        })
      ),
      http.get("http://localhost:8080/api/user", () =>
        HttpResponse.json(makeUser({ name: "Restored User" }))
      )
    );

    function ConsumerLocal() {
      const { user, isLoading } = useAuth();
      if (isLoading) return <div>loading</div>;
      return <div>{user ? `user:${user.name}` : "no-user"}</div>;
    }

    render(
      <AuthProvider>
        <ConsumerLocal />
      </AuthProvider>
    );

    await waitFor(() =>
      expect(screen.queryByText("loading")).not.toBeInTheDocument()
    );

    expect(screen.getByText("user:Restored User")).toBeInTheDocument();
  });
});
