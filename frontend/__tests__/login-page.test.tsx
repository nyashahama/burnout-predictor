import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

const mockPush = vi.fn();
const mockLogin = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/login",
}));

// Mock next/link so it renders as a plain anchor
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) =>
    React.createElement("a", { href, ...rest }, children),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    login: mockLogin,
    api: {},
  }),
}));

// ── helpers ────────────────────────────────────────────────────────────────────

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "u1",
    email: "user@example.com",
    name: "Alice",
    role: "engineer",
    sleep_baseline: 8,
    timezone: "UTC",
    email_verified: true,
    tier: "free",
    calendar_connected: false,
    onboarded: true,
    ...overrides,
  };
}

function makeAuthResult(overrides: Record<string, unknown> = {}) {
  return {
    access_token: "at-test",
    user: makeUser(),
    ...overrides,
  };
}

async function renderLoginPage() {
  const { default: LoginPage } = await import("@/app/login/page");
  render(<LoginPage />);
}

// ── tests ──────────────────────────────────────────────────────────────────────

describe("LoginPage", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    mockPush.mockReset();
    mockLogin.mockReset();
    localStorage.clear();
    sessionStorage.clear();
    document.cookie = "overload-session=; max-age=0; path=/";
    document.cookie = "overload-onboarded=; max-age=0; path=/";
    originalFetch = global.fetch;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "unexpected request" }), { status: 500 })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("sign-in mode", () => {
    it("signs in through the same-origin auth route", async () => {
      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (url === "/api/auth/login") {
          return new Response(JSON.stringify(makeAuthResult()), { status: 200 });
        }
        return originalFetch(input);
      });
      vi.stubGlobal("fetch", fetchMock);

      await renderLoginPage();
      fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
      fireEvent.change(screen.getByLabelText(/email/i), {
        target: { value: "user@example.com" },
      });
      fireEvent.change(screen.getByLabelText(/password/i), {
        target: { value: "hunter22" },
      });

      await act(async () => {
        fireEvent.submit(screen.getByRole("form") ?? screen.getByText(/sign in →/i).closest("form")!);
      });

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith("/dashboard");
        expect(fetchMock).toHaveBeenCalledWith("/api/auth/login", expect.any(Object));
      });
    });

    it("shows error message when login API returns an error", async () => {
      vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (url === "/api/auth/login") {
          return new Response(JSON.stringify({ error: "invalid credentials" }), { status: 401 });
        }
        return originalFetch(input);
      }));

      await renderLoginPage();

      fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

      fireEvent.change(screen.getByLabelText(/email/i), {
        target: { value: "user@example.com" },
      });
      fireEvent.change(screen.getByLabelText(/password/i), {
        target: { value: "wrongpass" },
      });

      await act(async () => {
        fireEvent.submit(screen.getByText(/sign in →/i).closest("form")!);
      });

      await waitFor(() => {
        expect(screen.getByRole("alert") || screen.getByText(/invalid|wrong|error|something/i)).toBeTruthy();
      });
    });

    it("redirects partially onboarded users to onboarding after sign-in", async () => {
      vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (url === "/api/auth/login") {
          return new Response(JSON.stringify(makeAuthResult({ user: makeUser({ onboarded: false }) })), { status: 200 });
        }
        return originalFetch(input);
      }));

      await renderLoginPage();
      fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
      fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "user@example.com" } });
      fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "hunter2" } });

      await act(async () => {
        fireEvent.submit(screen.getByText(/sign in →/i).closest("form")!);
      });

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith("/onboarding");
      });
    });
  });

  describe("sign-up mode", () => {
    it("renders a name field only in signup mode", async () => {
      await renderLoginPage();

      // Signup is default mode — name field should be visible
      expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
    });

    it("does NOT render name field in sign-in mode", async () => {
      await renderLoginPage();

      fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

      expect(screen.queryByLabelText(/name/i)).not.toBeInTheDocument();
    });

    it("validates that name is required when signing up", async () => {
      await renderLoginPage();

      // Fill email and password but leave name empty
      fireEvent.change(screen.getByLabelText(/email/i), {
        target: { value: "new@example.com" },
      });
      fireEvent.change(screen.getByLabelText(/password/i), {
        target: { value: "hunter22" },
      });

      await act(async () => {
        fireEvent.submit(screen.getByText(/create account →/i).closest("form")!);
      });

      await waitFor(() => {
        expect(screen.getByText(/enter your name/i)).toBeInTheDocument();
      });
    });

    it("creates the account immediately and redirects to onboarding", async () => {
      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (url === "/api/auth/register") {
          return new Response(JSON.stringify(makeAuthResult({ user: makeUser({ onboarded: false }) })), { status: 200 });
        }
        return originalFetch(input);
      });
      vi.stubGlobal("fetch", fetchMock);

      await renderLoginPage();

      fireEvent.change(screen.getByLabelText(/name/i), {
        target: { value: "Bob" },
      });
      fireEvent.change(screen.getByLabelText(/email/i), {
        target: { value: "bob@example.com" },
      });
      fireEvent.change(screen.getByLabelText(/password/i), {
        target: { value: "hunter22" },
      });

      await act(async () => {
        fireEvent.submit(screen.getByText(/create account →/i).closest("form")!);
      });

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith("/onboarding");
      });
      expect(fetchMock).toHaveBeenCalledWith("/api/auth/register", expect.any(Object));
      expect(sessionStorage.getItem("overload-pending-register")).toBeNull();
    });
  });
});
