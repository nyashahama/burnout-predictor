/**
 * Tests for the Onboarding page: handleFinish calls POST /api/auth/register.
 *
 * TDD: written BEFORE the implementation changes.
 */
import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../vitest.setup";
import { AuthProvider } from "@/contexts/AuthContext";

// ── mocks ──────────────────────────────────────────────────────────────────────

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/onboarding",
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) =>
    React.createElement("a", { href, ...rest }, children),
}));

// ── helpers ────────────────────────────────────────────────────────────────────

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "u2",
    email: "bob@example.com",
    name: "Bob",
    role: "engineer",
    sleep_baseline: 8,
    timezone: "UTC",
    email_verified: false,
    tier: "free",
    calendar_connected: false,
    ...overrides,
  };
}

function makeAuthResult(overrides: Record<string, unknown> = {}) {
  return {
    access_token: "at-onb",
    refresh_token: "rt-onb",
    user: makeUser(),
    ...overrides,
  };
}

async function renderOnboardingPage() {
  const { default: OnboardingPage } = await import("@/app/onboarding/page");
  render(
    <AuthProvider>
      <OnboardingPage />
    </AuthProvider>
  );
}

/** Walk through all onboarding steps and click "Let's start tracking" */
async function completeOnboarding() {
  // Step 0 — Name
  fireEvent.change(screen.getByPlaceholderText(/your first name/i), {
    target: { value: "Bob" },
  });
  fireEvent.click(screen.getByRole("button", { name: /continue →/i }));

  // Step 1 — Opening question
  await waitFor(() =>
    screen.getByText(/when did you last feel like yourself/i)
  );
  fireEvent.click(screen.getByText("This week"));
  fireEvent.click(screen.getByRole("button", { name: /continue →/i }));

  // Step 2 — Role
  await waitFor(() => screen.getByText(/what's your role/i));
  fireEvent.click(screen.getByText("Software Engineer"));
  fireEvent.click(screen.getByRole("button", { name: /continue →/i }));

  // Step 3 — Sleep
  await waitFor(() => screen.getByText(/how much sleep/i));
  fireEvent.click(screen.getByText("8 hours"));
  fireEvent.click(screen.getByRole("button", { name: /calculate my score →/i }));

  // Step 4 — Reveal
  await waitFor(() => screen.getByRole("button", { name: /let's start tracking →/i }));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /let's start tracking →/i }));
  });
}

// ── tests ──────────────────────────────────────────────────────────────────────

describe("OnboardingPage", () => {
  beforeEach(() => {
    mockPush.mockReset();
    localStorage.clear();
    sessionStorage.clear();
    document.cookie = "overload-session=; max-age=0; path=/";
    document.cookie = "overload-onboarded=; max-age=0; path=/";
  });

  it("calls POST /api/auth/register with pending data and redirects to /dashboard", async () => {
    let capturedBody: unknown = null;

    server.use(
      http.post("http://localhost:8080/api/auth/register", async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json(makeAuthResult());
      })
    );

    // Seed sessionStorage with pending registration data
    sessionStorage.setItem(
      "overload-pending-register",
      JSON.stringify({ email: "bob@example.com", password: "pass123", name: "Bob" })
    );

    await renderOnboardingPage();
    await completeOnboarding();

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/dashboard");
    });

    expect(capturedBody).toMatchObject({
      email: "bob@example.com",
      password: "pass123",
      name: "Bob",
      role: "engineer",
      sleep_baseline: 8,
    });
  });

  it("clears sessionStorage pending-register key after successful registration", async () => {
    server.use(
      http.post("http://localhost:8080/api/auth/register", () =>
        HttpResponse.json(makeAuthResult())
      )
    );

    sessionStorage.setItem(
      "overload-pending-register",
      JSON.stringify({ email: "bob@example.com", password: "pass123", name: "Bob" })
    );

    await renderOnboardingPage();
    await completeOnboarding();

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/dashboard"));

    expect(sessionStorage.getItem("overload-pending-register")).toBeNull();
  });

  it("stores user prefs in localStorage after successful registration", async () => {
    server.use(
      http.post("http://localhost:8080/api/auth/register", () =>
        HttpResponse.json(makeAuthResult({ user: makeUser({ name: "Bob", role: "engineer", sleep_baseline: 8 }) }))
      )
    );

    sessionStorage.setItem(
      "overload-pending-register",
      JSON.stringify({ email: "bob@example.com", password: "pass123", name: "Bob" })
    );

    await renderOnboardingPage();
    await completeOnboarding();

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/dashboard"));

    expect(localStorage.getItem("overload-name")).toBe("Bob");
    expect(localStorage.getItem("overload-role")).toBe("engineer");
    expect(localStorage.getItem("overload-sleep")).toBe("8");
  });

  it("sets overload-onboarded cookie after successful registration", async () => {
    server.use(
      http.post("http://localhost:8080/api/auth/register", () =>
        HttpResponse.json(makeAuthResult())
      )
    );

    sessionStorage.setItem(
      "overload-pending-register",
      JSON.stringify({ email: "bob@example.com", password: "pass123", name: "Bob" })
    );

    await renderOnboardingPage();
    await completeOnboarding();

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/dashboard"));

    expect(document.cookie).toContain("overload-onboarded=1");
  });

  it("shows error message when register API returns an error", async () => {
    server.use(
      http.post("http://localhost:8080/api/auth/register", () =>
        HttpResponse.json({ error: "email already exists" }, { status: 409 })
      )
    );

    sessionStorage.setItem(
      "overload-pending-register",
      JSON.stringify({ email: "bob@example.com", password: "pass123", name: "Bob" })
    );

    await renderOnboardingPage();
    await completeOnboarding();

    await waitFor(() => {
      // Should show an error and NOT navigate
      expect(mockPush).not.toHaveBeenCalledWith("/dashboard");
    });

    // Some error text should appear
    expect(
      screen.getByText(/registration failed|email already|error|try again/i)
    ).toBeInTheDocument();
  });
});
