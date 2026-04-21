/**
 * Tests for the Login page: sign-up creates account immediately via POST /api/auth/register,
 * sign-in uses POST /api/auth/login — no sessionStorage buffering.
 *
 * TDD: written BEFORE the implementation changes.
 */
import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { server } from "../vitest.setup";

// ── mocks ──────────────────────────────────────────────────────────────────────

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/login",
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) =>
    React.createElement("a", { href, ...rest }, children),
}));

vi.mock("@/lib/auth", () => ({
  setOnboardedCookie: vi.fn().mockResolvedValue(undefined),
}));

const mockLogin = vi.fn().mockResolvedValue(undefined);
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ login: mockLogin, user: null, api: null, isLoading: false }),
}));

// ── helpers ───────────────────────────────────────────────────────────────────

function makeUser(onboarded: boolean = false) {
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
    onboarded,
  };
}

function makeAuthResult(onboarded: boolean = false) {
  return {
    access_token: "at-test",
    refresh_token: "rt-test",
    user: makeUser(onboarded),
  };
}

async function renderLoginPage() {
  const { default: LoginPage } = await import("@/app/login/page");
  render(<LoginPage />);
}

// ── tests ──────────────────────────────────────────────────────────────────────

describe("LoginPage", () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockLogin.mockReset();
    localStorage.clear();
    sessionStorage.clear();
    document.cookie = "overload-session=; max-age=0; path=/";
    document.cookie = "overload-onboarded=; max-age=0; path=/";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("sign-up mode — creates account immediately", () => {
    it("calls POST /api/auth/register and redirects to /onboarding on success", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(makeAuthResult()), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

      await renderLoginPage();

      fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "Bob" } });
      fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "bob@example.com" } });
      fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "hunter22" } });

      await act(async () => {
        fireEvent.submit(screen.getByText(/create account →/i).closest("form")!);
      });

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith("/api/auth/register", expect.objectContaining({ method: "POST" }));
      });

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith("/onboarding");
      });
    });

    it("sends email, password, name, role=engineer, sleep_baseline=8, and timezone in the register body", async () => {
      let capturedBody: Record<string, unknown> = {};
      vi.spyOn(globalThis, "fetch").mockImplementation(
        async (url: RequestInfo | URL, init?: RequestInit) => {
          const urlStr = url instanceof URL ? url.toString() : String(url);
          if (urlStr.includes("/api/auth/register")) {
            if (init?.body) {
              capturedBody = JSON.parse(init.body as string);
            }
            return new Response(JSON.stringify(makeAuthResult()), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }
          return new Response("{}", { status: 200 });
        }
      );

      await renderLoginPage();

      fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "Bob" } });
      fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "bob@example.com" } });
      fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "hunter22" } });

      await act(async () => {
        fireEvent.submit(screen.getByText(/create account →/i).closest("form")!);
      });

      await waitFor(() => {
        expect(capturedBody).toMatchObject({
          email: "bob@example.com",
          password: "hunter22",
          name: "Bob",
          role: "engineer",
          sleep_baseline: 8,
        });
        expect(capturedBody.timezone).toBeTruthy();
      });

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith("/onboarding");
      });
    });

    it("does NOT store anything in sessionStorage on sign-up", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(makeAuthResult()), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

      await renderLoginPage();

      fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "Bob" } });
      fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "bob@example.com" } });
      fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "hunter22" } });

      await act(async () => {
        fireEvent.submit(screen.getByText(/create account →/i).closest("form")!);
      });

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith("/onboarding");
      });

      expect(sessionStorage.getItem("overload-pending-register")).toBeNull();
    });

    it("shows error when register API returns an error", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "email already taken" }), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        })
      );

      await renderLoginPage();

      fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "Bob" } });
      fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "bob@example.com" } });
      fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "hunter22" } });

      await act(async () => {
        fireEvent.submit(screen.getByText(/create account →/i).closest("form")!);
      });

      await waitFor(() => {
        expect(mockPush).not.toHaveBeenCalled();
        expect(screen.getByText(/email already|error/i)).toBeInTheDocument();
      });
    });
  });

  describe("sign-in mode — uses same-origin auth route", () => {
    it("calls POST /api/auth/login and redirects to /dashboard on success", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(makeAuthResult(true)), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

      await renderLoginPage();

      fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

      fireEvent.change(screen.getByLabelText(/email/i), {
        target: { value: "user@example.com" },
      });
      fireEvent.change(screen.getByLabelText(/password/i), {
        target: { value: "hunter22" },
      });

      await act(async () => {
        fireEvent.submit(screen.getByText(/sign in →/i).closest("form")!);
      });

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith("/dashboard");
      });
    });

    it("shows error when login API returns an error", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "invalid credentials" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        })
      );

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
        expect(screen.getByText(/invalid|wrong|error/i)).toBeInTheDocument();
      });
    });

    it("does NOT store anything in sessionStorage on sign-in", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(makeAuthResult(true)), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

      await renderLoginPage();

      fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

      fireEvent.change(screen.getByLabelText(/email/i), {
        target: { value: "user@example.com" },
      });
      fireEvent.change(screen.getByLabelText(/password/i), {
        target: { value: "hunter22" },
      });

      await act(async () => {
        fireEvent.submit(screen.getByText(/sign in →/i).closest("form")!);
      });

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith("/dashboard");
      });

      expect(sessionStorage.getItem("overload-pending-register")).toBeNull();
    });

    it("redirects to /onboarding when user is not onboarded", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(makeAuthResult(false)), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

      await renderLoginPage();

      fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

      fireEvent.change(screen.getByLabelText(/email/i), {
        target: { value: "user@example.com" },
      });
      fireEvent.change(screen.getByLabelText(/password/i), {
        target: { value: "hunter22" },
      });

      await act(async () => {
        fireEvent.submit(screen.getByText(/sign in →/i).closest("form")!);
      });

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith("/onboarding");
      });
    });
  });

  describe("mode switching", () => {
    it("renders a name field only in signup mode", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify(makeAuthResult()), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

      await renderLoginPage();
      expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
    });

    it("does NOT render name field in sign-in mode", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify(makeAuthResult()), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

      await renderLoginPage();
      fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
      expect(screen.queryByLabelText(/name/i)).not.toBeInTheDocument();
    });

    it("validates that name is required when signing up", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify(makeAuthResult()), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

      await renderLoginPage();

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
  });
});