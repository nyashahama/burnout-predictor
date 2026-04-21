import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

const mockPush = vi.fn();
const mockApiPost = vi.fn();
const mockUpdateUser = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/onboarding",
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) =>
    React.createElement("a", { href, ...rest }, children),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    api: { post: mockApiPost },
    updateUser: mockUpdateUser,
    user: {
      id: "u2",
      email: "bob@example.com",
      name: "Bob",
      role: "engineer",
      sleep_baseline: 8,
      timezone: "UTC",
      email_verified: false,
      tier: "free",
      calendar_connected: false,
      onboarded: false,
    },
  }),
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
    onboarded: true,
    ...overrides,
  };
}

async function renderOnboardingPage() {
  const { default: OnboardingPage } = await import("@/app/onboarding/page");
  render(<OnboardingPage />);
}

/** Walk through all onboarding steps and click "Let's start tracking" */
async function completeOnboarding() {
  await waitFor(() =>
    screen.getByText(/when did you last feel like yourself/i)
  );
  fireEvent.click(screen.getByText("This week"));
  fireEvent.click(screen.getByRole("button", { name: /continue →/i }));

  await waitFor(() => screen.getByText(/what's your role/i));
  fireEvent.click(screen.getByText("Software Engineer"));
  fireEvent.click(screen.getByRole("button", { name: /continue →/i }));

  await waitFor(() => screen.getByText(/how much sleep/i));
  fireEvent.click(screen.getByText("8 hours"));
  fireEvent.click(screen.getByRole("button", { name: /calculate my score →/i }));

  await waitFor(() => screen.getByRole("button", { name: /let's start tracking →/i }));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /let's start tracking →/i }));
  });
}

// ── tests ──────────────────────────────────────────────────────────────────────

describe("OnboardingPage", () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockApiPost.mockReset();
    mockUpdateUser.mockReset();
    localStorage.clear();
    document.cookie = "overload-session=; max-age=0; path=/";
    document.cookie = "overload-onboarded=; max-age=0; path=/";
  });

  it("calls POST /api/user/onboarding and redirects to /dashboard", async () => {
    mockApiPost.mockResolvedValue(makeUser());

    await renderOnboardingPage();
    await completeOnboarding();

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/dashboard");
    });

    expect(mockApiPost).toHaveBeenCalledWith(
      "/api/user/onboarding",
      expect.objectContaining({
      role: "engineer",
      sleep_baseline: 8,
      estimated_score: 28,
      }),
      expect.any(Function),
    );
  });

  it("updates auth state after successful onboarding", async () => {
    mockApiPost.mockResolvedValue(makeUser({ name: "Bob", role: "engineer", sleep_baseline: 8 }));

    await renderOnboardingPage();
    await completeOnboarding();

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/dashboard"));

    expect(mockUpdateUser).toHaveBeenCalledWith(expect.objectContaining({ name: "Bob", onboarded: true }));
  });

  it("sets overload-onboarded cookie after successful registration", async () => {
    mockApiPost.mockResolvedValue(makeUser());

    await renderOnboardingPage();
    await completeOnboarding();

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/dashboard"));

    expect(document.cookie).toContain("overload-onboarded=1");
  });

  it("shows error message when onboarding API returns an error", async () => {
    mockApiPost.mockRejectedValue(new Error("onboarding failed"));

    await renderOnboardingPage();
    await completeOnboarding();

    await waitFor(() => {
      // Should show an error and NOT navigate
      expect(mockPush).not.toHaveBeenCalledWith("/dashboard");
    });

    expect(
      screen.getByText(/onboarding failed|error|try again/i)
    ).toBeInTheDocument();
  });
});
