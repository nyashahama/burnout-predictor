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
import type { AuthResult, UserResponse } from "@/lib/types";

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

type AuthHarness = {
  user: UserResponse | null;
  login: (result: AuthResult) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<boolean>;
  updateUser: (user: UserResponse) => void;
};

function AuthHarness({
  onReady,
}: {
  onReady: (value: AuthHarness) => void;
}) {
  const auth = useAuth();

  React.useEffect(() => {
    onReady({
      user: auth.user,
      login: auth.login,
      logout: auth.logout,
      refreshSession: auth.refreshSession,
      updateUser: auth.updateUser,
    });
  }, [auth, onReady]);

  if (auth.isLoading) return <div>loading</div>;
  return <div>{auth.user ? `user:${auth.user.name}` : "no-user"}</div>;
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
    document.cookie = "overload-session=; max-age=0; path=/";
    document.cookie = "overload-onboarded=; max-age=0; path=/";
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
    let harness: AuthHarness | null = null;

    render(
      <AuthProvider>
        <AuthHarness onReady={(value) => { harness = value; }} />
      </AuthProvider>
    );

    await waitFor(() =>
      expect(screen.queryByText("loading")).not.toBeInTheDocument()
    );

    const result = makeAuthResult();
    await act(async () => {
      await harness!.login(result as AuthResult);
    });

    expect(harness!.user).not.toBeNull();
    expect(harness!.user!.name).toBe("Test User");
    expect(localStorage.getItem("overload-refresh-token")).toBe("rt-xyz");
  });

  it("logout clears user and tokens", async () => {
    server.use(
      http.post("http://localhost:8080/api/auth/logout", () =>
        HttpResponse.json({}, { status: 200 })
      )
    );

    let harness: AuthHarness | null = null;

    render(
      <AuthProvider>
        <AuthHarness onReady={(value) => { harness = value; }} />
      </AuthProvider>
    );

    await waitFor(() =>
      expect(screen.queryByText("loading")).not.toBeInTheDocument()
    );

    // Log in first
    await act(async () => {
      await harness!.login(makeAuthResult() as AuthResult);
    });
    expect(harness!.user!.name).toBe("Test User");

    // Now log out
    await act(async () => {
      await harness!.logout();
    });

    expect(harness!.user).toBeNull();
    expect(localStorage.getItem("overload-refresh-token")).toBeNull();
  });

  it("refreshSession returns false when no refresh token stored", async () => {
    let harness: AuthHarness | null = null;

    render(
      <AuthProvider>
        <AuthHarness onReady={(value) => { harness = value; }} />
      </AuthProvider>
    );

    await waitFor(() =>
      expect(screen.queryByText("loading")).not.toBeInTheDocument()
    );

    const result = await harness!.refreshSession();
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

    let harness: AuthHarness | null = null;

    render(
      <AuthProvider>
        <AuthHarness onReady={(value) => { harness = value; }} />
      </AuthProvider>
    );

    await waitFor(() =>
      expect(screen.queryByText("loading")).not.toBeInTheDocument()
    );

    const result = await act(async () => harness!.refreshSession());
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
    expect(document.cookie).toContain("overload-session=1");
    expect(document.cookie).toContain("overload-onboarded=1");
    expect(localStorage.getItem("overload-name")).toBe("Restored User");
  });

  it("updateUser refreshes shared user state and local profile cache", async () => {
    let harness: AuthHarness | null = null;

    render(
      <AuthProvider>
        <AuthHarness onReady={(value) => { harness = value; }} />
      </AuthProvider>
    );

    await waitFor(() =>
      expect(screen.queryByText("loading")).not.toBeInTheDocument()
    );

    await act(async () => {
      await harness!.login(makeAuthResult() as AuthResult);
    });

    act(() => {
      harness!.updateUser(makeUser({ name: "Updated Name", role: "manager", sleep_baseline: 9 }) as UserResponse);
    });

    expect(screen.getByText("user:Updated Name")).toBeInTheDocument();
    expect(localStorage.getItem("overload-name")).toBe("Updated Name");
    expect(localStorage.getItem("overload-role")).toBe("manager");
    expect(localStorage.getItem("overload-sleep")).toBe("9");
  });
});
