/**
 * Tests for the Onboarding page: handleFinish calls POST /api/user/onboarding to complete setup.
 * No sessionStorage reads — all data comes from the component's own state.
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
  usePathname: () => "/onboarding",
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) =>
    React.createElement("a", { href, ...rest }, children),
}));

vi.mock("@/lib/auth", () => ({
  setOnboardedCookie: async () => {
    document.cookie = "overload-onboarded=1; path=/; max-age=2592000; SameSite=Lax";
  },
}));

const mockUpdateUser = vi.fn();
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    login: vi.fn(),
    user: null,
    api: null,
    isLoading: false,
    updateUser: mockUpdateUser,
  }),
}));

// ── helpers ───────────────────────────────────────────────────────────────────

function makeUserResponse(overrides: Record<string, unknown> = {}) {
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

async function renderOnboardingPage() {
  const { default: OnboardingPage } = await import("@/app/onboarding/page");
  render(<OnboardingPage />);
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
    mockUpdateUser.mockReset();
    localStorage.clear();
    sessionStorage.clear();
    document.cookie = "overload-session=; max-age=0; path=/";
    document.cookie = "overload-onboarded=; max-age=0; path=/";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls POST /api/user/onboarding and redirects to /dashboard on success", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(makeUserResponse()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    await renderOnboardingPage();
    await completeOnboarding();

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/user/onboarding",
        expect.objectContaining({ method: "POST" })
      );
    });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("sends role, sleep_baseline, estimated_score, and timezone in the onboarding body", async () => {
    let capturedBody: Record<string, unknown> = {};
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async (url: RequestInfo | URL, init?: RequestInit) => {
        const urlStr = url instanceof URL ? url.toString() : String(url);
        if (urlStr.includes("/api/user/onboarding")) {
          if (init?.body) {
            capturedBody = JSON.parse(init.body as string);
          }
          return new Response(JSON.stringify(makeUserResponse()), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response("{}", { status: 200 });
      }
    );

    await renderOnboardingPage();
    await completeOnboarding();

    await waitFor(() => {
      expect(capturedBody).toMatchObject({
        role: "engineer",
        sleep_baseline: 8,
        estimated_score: 28,
      });
      expect(capturedBody.timezone).toBeTruthy();
    });
  });

  it("does NOT read sessionStorage for registration data", async () => {
    sessionStorage.setItem(
      "overload-pending-register",
      JSON.stringify({ email: "old@example.com", password: "wrong", name: "ShouldNotUse" })
    );

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(makeUserResponse()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    await renderOnboardingPage();
    await completeOnboarding();

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/dashboard");
    });

    expect(sessionStorage.getItem("overload-pending-register")).toBe("{\"email\":\"old@example.com\",\"password\":\"wrong\",\"name\":\"ShouldNotUse\"}");
  });

  it("stores user prefs in localStorage after onboarding completes", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(makeUserResponse({ name: "Bob", role: "engineer", sleep_baseline: 8 })), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    await renderOnboardingPage();
    await completeOnboarding();

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/dashboard"));

    expect(localStorage.getItem("overload-name")).toBe("Bob");
    expect(localStorage.getItem("overload-role")).toBe("engineer");
    expect(localStorage.getItem("overload-sleep")).toBe("8");
  });

  it("sets overload-onboarded cookie after successful onboarding", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(makeUserResponse()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    await renderOnboardingPage();
    await completeOnboarding();

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/dashboard");
      expect(document.cookie).toContain("overload-onboarded=1");
    });
  });

  it("shows error when onboarding API returns an error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "onboarding failed" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    );

    await renderOnboardingPage();
    await completeOnboarding();

    await waitFor(() => {
      expect(mockPush).not.toHaveBeenCalledWith("/dashboard");
      expect(screen.getByText(/onboarding failed|try again|error/i)).toBeInTheDocument();
    });
  });
});