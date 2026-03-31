/**
 * Tests for the Login page: sign-in calls real backend, sign-up buffers to sessionStorage.
 *
 * TDD: written BEFORE the implementation changes.
 */
import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../vitest.setup";
import { AuthProvider } from "@/contexts/AuthContext";

// ── mocks ──────────────────────────────────────────────────────────────────────

// Mock next/navigation so useRouter works in the test environment
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/login",
}));

// Mock next/link so it renders as a plain anchor
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) =>
    React.createElement("a", { href, ...rest }, children),
}));

// ── helpers ────────────────────────────────────────────────────────────────────

function makeUser() {
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
  };
}

function makeAuthResult() {
  return {
    access_token: "at-test",
    refresh_token: "rt-test",
    user: makeUser(),
  };
}

async function renderLoginPage() {
  const { default: LoginPage } = await import("@/app/login/page");
  render(
    <AuthProvider>
      <LoginPage />
    </AuthProvider>
  );
}

// ── tests ──────────────────────────────────────────────────────────────────────

describe("LoginPage", () => {
  beforeEach(() => {
    mockPush.mockReset();
    localStorage.clear();
    sessionStorage.clear();
    document.cookie = "overload-session=; max-age=0; path=/";
    document.cookie = "overload-onboarded=; max-age=0; path=/";
  });

  describe("sign-in mode", () => {
    it("calls POST /api/auth/login and redirects to /dashboard on success", async () => {
      server.use(
        http.post("http://localhost:8080/api/auth/login", () =>
          HttpResponse.json(makeAuthResult())
        )
      );

      await renderLoginPage();

      // Switch to sign-in tab
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
      });
    });

    it("shows error message when login API returns an error", async () => {
      server.use(
        http.post("http://localhost:8080/api/auth/login", () =>
          HttpResponse.json({ error: "invalid credentials" }, { status: 401 })
        )
      );

      await renderLoginPage();

      // Switch to sign-in tab
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

    it("sets overload-onboarded cookie after successful sign-in", async () => {
      server.use(
        http.post("http://localhost:8080/api/auth/login", () =>
          HttpResponse.json(makeAuthResult())
        )
      );

      await renderLoginPage();

      fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
      fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "user@example.com" } });
      fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "hunter2" } });

      await act(async () => {
        fireEvent.submit(screen.getByText(/sign in →/i).closest("form")!);
      });

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith("/dashboard");
      });

      expect(document.cookie).toContain("overload-onboarded=1");
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

    it("stores pending register data in sessionStorage and redirects to /onboarding on signup", async () => {
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

      const pending = JSON.parse(
        sessionStorage.getItem("overload-pending-register") ?? "{}"
      );
      expect(pending.email).toBe("bob@example.com");
      expect(pending.password).toBe("hunter22");
      expect(pending.name).toBe("Bob");
    });
  });
});
