# Frontend ↔ Backend Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all mock data, localStorage state, and fake cookie auth in the Next.js frontend with real API calls to the Go backend.

**Architecture:** The frontend calls the Go backend directly via `NEXT_PUBLIC_API_URL`. Auth uses JWT — access token stored in React context memory, refresh token in `localStorage`, and a lightweight `overload-session` cookie toggled for the Next.js middleware gate. A central `ApiClient` class in `frontend/lib/api.ts` attaches the Bearer header and auto-refreshes on 401.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, Vitest + React Testing Library + MSW (mock service worker for tests), Chi/Go backend at `http://localhost:8080`.

---

## File Structure

### New files
| File | Purpose |
|------|---------|
| `frontend/lib/types.ts` | TypeScript types mirroring backend JSON shapes |
| `frontend/lib/api.ts` | `ApiClient` class — fetch wrapper, auto-refresh, error handling |
| `frontend/lib/auth.ts` | Token storage helpers (localStorage + session cookie) |
| `frontend/contexts/AuthContext.tsx` | React context + provider; exposes `user`, `accessToken`, `login`, `logout`, `refreshSession` |
| `frontend/vitest.config.ts` | Vitest config with happy-dom environment |
| `frontend/vitest.setup.ts` | Testing-library setup + MSW server bootstrap |
| `frontend/lib/__tests__/api.test.ts` | Unit tests for ApiClient |
| `frontend/lib/__tests__/auth.test.ts` | Unit tests for token helpers |

### Modified files
| File | Change |
|------|--------|
| `frontend/package.json` | Add vitest, @testing-library/react, @testing-library/user-event, happy-dom, msw |
| `frontend/app/layout.tsx` | Wrap children with `<AuthProvider>` |
| `frontend/app/login/page.tsx` | Call `POST /api/auth/login` and `POST /api/auth/register` (add name field to signup) |
| `frontend/app/onboarding/page.tsx` | Read pending registration from sessionStorage; call `POST /api/auth/register` on submit |
| `frontend/middleware.ts` | Keep cookie check, no changes needed |
| `frontend/components/dashboard/DashboardShell.tsx` | Call `POST /api/auth/logout`; use `user.name` from context |
| `frontend/app/dashboard/page.tsx` | Replace localStorage score engine with `GET /api/score` + `GET /api/checkins` |
| `frontend/components/dashboard/ScoreCard.tsx` | Accept real `ScoreCardResult` prop |
| `frontend/components/dashboard/CheckIn.tsx` | Call `POST /api/checkins` instead of localStorage |
| `frontend/components/dashboard/ForecastChart.tsx` | Derive 7-day view from check-in history |
| `frontend/components/dashboard/HistoryChart.tsx` | Accept real `CheckIn[]` from API |
| `frontend/components/dashboard/PersonalizedInsight.tsx` | Fetch `GET /api/insights` |
| `frontend/app/dashboard/history/page.tsx` | Fetch `GET /api/checkins` |
| `frontend/app/dashboard/settings/page.tsx` | Fetch/patch `GET+PATCH /api/user` and `GET+PATCH /api/notifications/prefs` |

---

## Task 1: Test Infrastructure

**Files:**
- Create: `frontend/vitest.config.ts`
- Create: `frontend/vitest.setup.ts`
- Modify: `frontend/package.json`

- [ ] **Step 1: Install test dependencies**

```bash
cd frontend
npm install --save-dev vitest @vitest/coverage-v8 @testing-library/react @testing-library/user-event @testing-library/jest-dom happy-dom msw
```

Expected: packages added to `node_modules`, no peer-dep errors.

- [ ] **Step 2: Create vitest.config.ts**

```typescript
// frontend/vitest.config.ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "happy-dom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
```

- [ ] **Step 3: Create vitest.setup.ts**

```typescript
// frontend/vitest.setup.ts
import "@testing-library/jest-dom";
import { afterAll, afterEach, beforeAll } from "vitest";
import { setupServer } from "msw/node";

export const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

- [ ] **Step 4: Add test script to package.json**

In `frontend/package.json`, add to `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Verify test runner works**

```bash
cd frontend && npx vitest run --reporter=verbose
```

Expected: "No test files found" or 0 failures (no tests yet, runner works).

- [ ] **Step 6: Commit**

```bash
cd frontend
git add package.json vitest.config.ts vitest.setup.ts
git commit -m "test: add vitest + RTL + MSW test infrastructure"
```

---

## Task 2: API Types

**Files:**
- Create: `frontend/lib/types.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/lib/__tests__/types.test.ts`:

```typescript
import { describe, it, expectTypeOf } from "vitest";
import type { UserResponse, ScoreCardResult, CheckIn, InsightBundle } from "../types";

describe("API types", () => {
  it("UserResponse has required fields", () => {
    expectTypeOf<UserResponse>().toHaveProperty("id");
    expectTypeOf<UserResponse>().toHaveProperty("email");
    expectTypeOf<UserResponse>().toHaveProperty("name");
    expectTypeOf<UserResponse>().toHaveProperty("role");
    expectTypeOf<UserResponse>().toHaveProperty("sleep_baseline");
    expectTypeOf<UserResponse>().toHaveProperty("tier");
  });

  it("ScoreCardResult has score and has_checkin", () => {
    expectTypeOf<ScoreCardResult>().toHaveProperty("score");
    expectTypeOf<ScoreCardResult>().toHaveProperty("has_checkin");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd frontend && npx vitest run lib/__tests__/types.test.ts
```

Expected: FAIL — `../types` module not found.

- [ ] **Step 3: Create frontend/lib/types.ts**

```typescript
// frontend/lib/types.ts

export type SignalLevel = "ok" | "warning" | "danger";

export interface Signal {
  label: string;
  detail: string;
  val: string;
  level: SignalLevel;
}

export interface ScoreOutput {
  score: number;
  level: SignalLevel;
  label: string;
  signals: Signal[];
}

export interface PlanSection {
  timing: string;
  actions: string[];
}

export interface UserResponse {
  id: string;
  email: string;
  name: string;
  role: string;
  sleep_baseline: number;
  timezone: string;
  email_verified: boolean;
  tier: string;
  calendar_connected: boolean;
}

export interface AuthResult {
  access_token: string;
  refresh_token: string;
  user: UserResponse;
}

export interface RefreshResult {
  access_token: string;
  refresh_token: string;
}

export interface ScoreCardResult {
  score: ScoreOutput;
  explanation: string;
  suggestion: string;
  trajectory: string;
  accuracy_label: string;
  streak: number;
  has_checkin: boolean;
}

export interface CheckIn {
  id: string;
  user_id: string;
  checked_in_date: string;        // "YYYY-MM-DD" — pgtype.Date marshals to date string
  stress: number;                 // int16
  score: number;                  // int16
  note: string | null;            // pgtype.Text marshals to string or null
  role_snapshot: string;
  sleep_snapshot: number;
  meeting_count: number | null;   // pgtype.Int2 marshals to number or null
  ai_recovery_plan: string | null; // []byte marshals to base64 string or null
  ai_generated_at: string | null; // pgtype.Timestamptz marshals to ISO string or null
  created_at: string;             // pgtype.Timestamptz
  updated_at: string;             // pgtype.Timestamptz
  energy_level: number | null;    // pgtype.Int2
  focus_quality: number | null;   // pgtype.Int2
  hours_worked: number | null;    // pgtype.Numeric marshals to decimal or null
  physical_symptoms: string[];
}

export interface UpsertCheckInRequest {
  stress: number;
  note?: string;
  energy_level?: number;
  focus_quality?: number;
  hours_worked?: number;
  physical_symptoms?: string[];
}

export interface UpsertCheckInResult {
  check_in: CheckIn;
  score: ScoreOutput;
  explanation: string;
  suggestion: string;
  recovery_plan?: PlanSection[];
}

export interface SessionContext {
  message: string;
  kind: "drop" | "rise" | "note_reference" | "neutral";
}

export type Trend = "improving" | "stable" | "worsening";

export interface EarnedPatternInsight {
  // Go: score.EarnedPatternInsightResult — no json tags, uses default capitalized field names
  Message: string;
  DOW: number; // 0–6, day of week
}

export interface SignatureData {
  // Go: score.SignatureData — no json tags, uses default capitalized field names
  HardestDay: string | null;
  EasiestDay: string | null;
  TopTrigger: string | null;
  TriggerLift: number;
  AvgScore: number;
  RecoveryDays: number | null;
  Trend: Trend;
}

export interface MonthlyArcResult {
  // Go: score.MonthlyArcResult — no json tags, uses default capitalized field names
  CurrentAvg: number;
  PreviousAvg: number;
  Delta: number;
  MonthName: string;
  Message: string;
}

export interface MilestoneData {
  // Go: score.MilestoneData — no json tags, uses default capitalized field names
  Milestone: number; // 30, 60, or 90
  HardestDay: string | null;
  EasiestDay: string | null;
  KeywordTrigger: string | null;
  KeywordLift: number;
  RecoveryDays: number | null;
  FirstHalfAvg: number;
  SecondHalfAvg: number;
  TotalEntries: number;
}

export interface InsightBundle {
  session_context: SessionContext | null;
  patterns: string[];
  earned_pattern: EarnedPatternInsight | null;
  signature: SignatureData | null;
  signature_narrative: string;
  arc_narrative: string;
  monthly_arc: MonthlyArcResult | null;
  what_works: string;
  milestone: MilestoneData | null;
  check_in_count: number;
  accuracy_label: string;
  dismissed_components: string[];
}

// NotificationPrefs matches handler.NotifPrefsResponse exactly.
export interface NotificationPrefs {
  checkin_reminder: boolean;
  reminder_time: string;          // "HH:MM"
  monday_debrief_email: boolean;
  weekly_summary_email: boolean;
  streak_alert_email: boolean;
  pattern_email: boolean;
  re_engage_email: boolean;
}

export interface UpdateProfileRequest {
  name?: string;
  role?: string;
  sleep_baseline?: number;
  timezone?: string;
}

export interface ApiError {
  error: string;
}
```

- [ ] **Step 4: Run the types test**

```bash
cd frontend && npx vitest run lib/__tests__/types.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd frontend
git add lib/types.ts lib/__tests__/types.test.ts
git commit -m "feat: add TypeScript API types matching backend JSON shapes"
```

---

## Task 3: API Client

**Files:**
- Create: `frontend/lib/auth.ts`
- Create: `frontend/lib/api.ts`
- Create: `frontend/lib/__tests__/auth.test.ts`
- Create: `frontend/lib/__tests__/api.test.ts`

- [ ] **Step 1: Write failing tests for auth helpers**

Create `frontend/lib/__tests__/auth.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  storeTokens,
  getRefreshToken,
  getAccessToken,
  clearTokens,
  setSessionCookie,
  clearSessionCookie,
} from "../auth";

describe("auth storage helpers", () => {
  beforeEach(() => {
    localStorage.clear();
    // Reset cookies
    document.cookie = "overload-session=; max-age=0; path=/";
  });

  it("stores and retrieves refresh token", () => {
    storeTokens("acc123", "ref456");
    expect(getRefreshToken()).toBe("ref456");
  });

  it("getAccessToken returns null before store", () => {
    expect(getAccessToken()).toBeNull();
  });

  it("clearTokens removes stored tokens", () => {
    storeTokens("acc", "ref");
    clearTokens();
    expect(getRefreshToken()).toBeNull();
  });

  it("setSessionCookie sets overload-session cookie", () => {
    setSessionCookie();
    expect(document.cookie).toContain("overload-session=1");
  });

  it("clearSessionCookie removes cookie", () => {
    setSessionCookie();
    clearSessionCookie();
    expect(document.cookie).not.toContain("overload-session=1");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd frontend && npx vitest run lib/__tests__/auth.test.ts
```

Expected: FAIL — `../auth` not found.

- [ ] **Step 3: Create frontend/lib/auth.ts**

```typescript
// frontend/lib/auth.ts

const REFRESH_TOKEN_KEY = "overload-refresh-token";

/** In-memory access token — lives only for the duration of the session. */
let _accessToken: string | null = null;

export function storeTokens(accessToken: string, refreshToken: string) {
  _accessToken = accessToken;
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function getAccessToken(): string | null {
  return _accessToken;
}

export function setAccessToken(token: string) {
  _accessToken = token;
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function clearTokens() {
  _accessToken = null;
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem("overload-name");
  localStorage.removeItem("overload-role");
  localStorage.removeItem("overload-sleep");
}

export function setSessionCookie() {
  document.cookie = "overload-session=1; path=/; max-age=2592000; SameSite=Lax";
}

export function setOnboardedCookie() {
  document.cookie = "overload-onboarded=1; path=/; max-age=2592000; SameSite=Lax";
}

export function clearSessionCookie() {
  document.cookie = "overload-session=; path=/; max-age=0; SameSite=Lax";
  document.cookie = "overload-onboarded=; path=/; max-age=0; SameSite=Lax";
}
```

- [ ] **Step 4: Run auth tests — verify PASS**

```bash
cd frontend && npx vitest run lib/__tests__/auth.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 5: Write failing tests for ApiClient**

Create `frontend/lib/__tests__/api.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../vitest.setup";
import { ApiClient } from "../api";

const BASE = "http://localhost:8080";

describe("ApiClient", () => {
  let client: ApiClient;

  beforeEach(() => {
    client = new ApiClient(BASE, () => null, () => {});
  });

  it("GET request returns parsed JSON", async () => {
    server.use(
      http.get(`${BASE}/api/score`, () =>
        HttpResponse.json({ score: { score: 42, level: "warning", label: "Moderate load", signals: [] }, has_checkin: true, streak: 3, trajectory: "stable", explanation: "", suggestion: "", accuracy_label: "" })
      )
    );
    const result = await client.get("/api/score");
    expect(result.score.score).toBe(42);
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

  it("throws ApiError on non-2xx response", async () => {
    server.use(
      http.get(`${BASE}/api/score`, () =>
        HttpResponse.json({ error: "unauthorized" }, { status: 401 })
      )
    );
    // Provide no refresh token so auto-refresh gives up immediately
    await expect(client.get("/api/score")).rejects.toThrow("unauthorized");
  });

  it("attaches Authorization header when token provided", async () => {
    let authHeader: string | null = null;
    server.use(
      http.get(`${BASE}/api/user`, ({ request }) => {
        authHeader = request.headers.get("Authorization");
        return HttpResponse.json({ id: "1", email: "a@b.com", name: "Alex", role: "engineer", sleep_baseline: 8, timezone: "UTC", email_verified: true, tier: "free", calendar_connected: false });
      })
    );
    const tokenClient = new ApiClient(BASE, () => "mytoken", () => {});
    await tokenClient.get("/api/user");
    expect(authHeader).toBe("Bearer mytoken");
  });
});
```

- [ ] **Step 6: Run to verify it fails**

```bash
cd frontend && npx vitest run lib/__tests__/api.test.ts
```

Expected: FAIL — `../api` not found.

- [ ] **Step 7: Create frontend/lib/api.ts**

```typescript
// frontend/lib/api.ts
import type { ApiError } from "./types";

export class ApiClientError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiClientError";
  }
}

/**
 * ApiClient wraps fetch with:
 * - Automatic Bearer token attachment
 * - Auto-refresh on 401 (single retry)
 * - JSON parse + error extraction
 *
 * getToken / onTokenRefreshed are injected so the class stays testable
 * without a real AuthContext.
 */
export class ApiClient {
  constructor(
    private baseUrl: string,
    private getToken: () => string | null,
    private onUnauthenticated: () => void
  ) {}

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    retry = true
  ): Promise<T> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (res.status === 401 && retry) {
      // Signal auth context to refresh, then retry once.
      // We surface this as a rejected promise; AuthContext catches it.
      this.onUnauthenticated();
      throw new ApiClientError(401, "Session expired");
    }

    if (!res.ok) {
      let message = res.statusText;
      try {
        const err = (await res.json()) as ApiError;
        if (err.error) message = err.error;
      } catch {
        // ignore parse failure
      }
      throw new ApiClientError(res.status, message);
    }

    // 204 No Content
    if (res.status === 204) return undefined as T;

    return res.json() as Promise<T>;
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>("PATCH", path, body);
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>("DELETE", path);
  }
}

/** Singleton factory — called from AuthContext after tokens are known. */
let _client: ApiClient | null = null;

export function createApiClient(
  getToken: () => string | null,
  onUnauthenticated: () => void
): ApiClient {
  _client = new ApiClient(
    process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080",
    getToken,
    onUnauthenticated
  );
  return _client;
}
```

- [ ] **Step 8: Run API client tests**

```bash
cd frontend && npx vitest run lib/__tests__/api.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 9: Run all tests**

```bash
cd frontend && npx vitest run
```

Expected: All tests pass.

- [ ] **Step 10: Commit**

```bash
cd frontend
git add lib/auth.ts lib/api.ts lib/__tests__/auth.test.ts lib/__tests__/api.test.ts
git commit -m "feat: add API client and token storage helpers"
```

---

## Task 4: Auth Context

**Files:**
- Create: `frontend/contexts/AuthContext.tsx`
- Modify: `frontend/app/layout.tsx`

- [ ] **Step 1: Create frontend/contexts/AuthContext.tsx**

```typescript
// frontend/contexts/AuthContext.tsx
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ApiClient, createApiClient } from "@/lib/api";
import {
  storeTokens,
  getRefreshToken,
  getAccessToken,
  setAccessToken,
  clearTokens,
  setSessionCookie,
  clearSessionCookie,
} from "@/lib/auth";
import type { AuthResult, RefreshResult, UserResponse } from "@/lib/types";

interface AuthContextValue {
  user: UserResponse | null;
  api: ApiClient | null;
  isLoading: boolean;
  login: (result: AuthResult) => void;
  logout: () => Promise<void>;
  refreshSession: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const apiRef = useRef<ApiClient | null>(null);

  const handleUnauthenticated = useCallback(() => {
    clearTokens();
    clearSessionCookie();
    setUser(null);
    // Redirect to login — only in browser
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
  }, []);

  // Build the ApiClient once, injecting live token getter
  const api = useMemo(() => {
    const client = createApiClient(
      () => getAccessToken(),
      handleUnauthenticated
    );
    apiRef.current = client;
    return client;
  }, [handleUnauthenticated]);

  const login = useCallback(
    (result: AuthResult) => {
      storeTokens(result.access_token, result.refresh_token);
      setSessionCookie();
      setUser(result.user);
    },
    []
  );

  const refreshSession = useCallback(async (): Promise<boolean> => {
    const rt = getRefreshToken();
    if (!rt) return false;
    try {
      const result = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080"}/api/auth/refresh`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: rt }),
        }
      );
      if (!result.ok) return false;
      const data = (await result.json()) as RefreshResult;
      storeTokens(data.access_token, data.refresh_token);
      return true;
    } catch {
      return false;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api?.post("/api/auth/logout");
    } catch {
      // ignore — clear client-side regardless
    }
    clearTokens();
    clearSessionCookie();
    setUser(null);
  }, [api]);

  // On mount: try to restore session from stored refresh token
  useEffect(() => {
    async function restore() {
      const rt = getRefreshToken();
      if (!rt) {
        setIsLoading(false);
        return;
      }
      const ok = await refreshSession();
      if (ok) {
        try {
          const profile = await api.get<UserResponse>("/api/user");
          setUser(profile);
          setSessionCookie();
        } catch {
          clearTokens();
          clearSessionCookie();
        }
      } else {
        clearTokens();
        clearSessionCookie();
      }
      setIsLoading(false);
    }
    restore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AuthContext.Provider value={{ user, api, isLoading, login, logout, refreshSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
```

- [ ] **Step 2: Wrap app layout with AuthProvider**

In `frontend/app/layout.tsx`, add import and wrap `{children}`:

```typescript
import { AuthProvider } from "@/contexts/AuthContext";
// ... existing imports ...

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
```

(Read the actual file first and preserve existing font/className setup.)

- [ ] **Step 3: Verify build compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
cd frontend
git add contexts/AuthContext.tsx app/layout.tsx
git commit -m "feat: add AuthContext with JWT session management"
```

---

## Task 5: Auth Flow — Login, Register, Onboarding

**Files:**
- Modify: `frontend/app/login/page.tsx`
- Modify: `frontend/app/onboarding/page.tsx`

**Design:**
- Sign-up: collect email + password + name → store `{ email, password, name }` in `sessionStorage("overload-pending-register")` → redirect to `/onboarding`
- Onboarding completion: read pending-register, add role + sleep_baseline + timezone → `POST /api/auth/register` → `login(result)` → set `overload-onboarded` cookie → `/dashboard`
- Sign-in: `POST /api/auth/login` → `login(result)` → set `overload-onboarded` cookie → `/dashboard`

- [ ] **Step 1: Update login/page.tsx**

Replace the mock `handleSubmit` logic. Key changes:
1. Add a `name` field (shown only in signup mode)
2. Replace fake setTimeout with real fetch via `api` from AuthContext
3. On signup: store pending data, redirect to onboarding
4. On signin: call login endpoint, set cookies, redirect

Read `frontend/app/login/page.tsx` fully, then apply these changes:

```typescript
// Replace the handleSubmit function:

const { login, api } = useAuth();

async function handleSubmit(e: React.FormEvent) {
  e.preventDefault();
  setError("");
  const err = validate();
  if (err) { setError(err); return; }
  setLoading(true);

  try {
    if (mode === "signup") {
      // Buffer registration data for onboarding to complete
      sessionStorage.setItem(
        "overload-pending-register",
        JSON.stringify({ email: email.trim(), password, name: name.trim() })
      );
      router.push("/onboarding");
    } else {
      const result = await api!.post<AuthResult>("/api/auth/login", {
        email: email.trim(),
        password,
      });
      login(result);
      setOnboardedCookie(); // import from @/lib/auth
      router.push("/dashboard");
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Something went wrong";
    setError(msg);
  } finally {
    setLoading(false);
  }
}
```

Also add `name` state and a name input field (visible only in signup mode, positioned after the email field). Import `AuthResult` from `@/lib/types` and `useAuth` from `@/contexts/AuthContext`.

- [ ] **Step 2: Update onboarding/page.tsx**

Replace the final `handleFinish` function (currently stores to localStorage and sets cookie). Read the full file first, then apply:

```typescript
// Add import at top:
import { useAuth } from "@/contexts/AuthContext";
import type { AuthResult } from "@/lib/types";

// Inside component:
const { login, api } = useAuth();

// Replace handleFinish:
async function handleFinish() {
  setLoading(true);
  try {
    const pending = JSON.parse(
      sessionStorage.getItem("overload-pending-register") ?? "{}"
    ) as { email?: string; password?: string; name?: string };

    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

    const result = await api!.post<AuthResult>("/api/auth/register", {
      email: pending.email ?? "",
      password: pending.password ?? "",
      name: pending.name ?? name.trim() || "there",
      role,
      sleep_baseline: parseInt(sleep, 10),
      timezone: tz,
    });

    sessionStorage.removeItem("overload-pending-register");
    login(result);

    // Persist display-only prefs to localStorage (for components that still read them)
    localStorage.setItem("overload-name", result.user.name);
    localStorage.setItem("overload-role", result.user.role);
    localStorage.setItem("overload-sleep", String(result.user.sleep_baseline));
    localStorage.setItem("overload-last-felt", lastFelt);

    setOnboardedCookie(); // import from @/lib/auth
    router.push("/dashboard");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Registration failed";
    setError(msg);
  } finally {
    setLoading(false);
  }
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd frontend && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Manual smoke test (docker-compose)**

```bash
cd /home/nyasha-hama/projects/burnout-predictor
docker compose up -d
```

Navigate to `http://localhost:3000/login`:
1. Sign up with email, password, name → should land on `/onboarding`
2. Complete onboarding → should land on `/dashboard`
3. Sign out, then sign back in → should land on `/dashboard`

- [ ] **Step 5: Commit**

```bash
cd frontend
git add app/login/page.tsx app/onboarding/page.tsx
git commit -m "feat: wire login and register to real backend auth endpoints"
```

---

## Task 6: Dashboard Shell — Real Logout + User Name

**Files:**
- Modify: `frontend/components/dashboard/DashboardShell.tsx`

- [ ] **Step 1: Update DashboardShell.tsx**

Read the file. Find the sign-out handler and the user name display. Apply:

```typescript
// Add at top of file:
import { useAuth } from "@/contexts/AuthContext";

// Inside component:
const { user, logout } = useAuth();

// Replace existing sign-out handler:
async function handleSignOut() {
  await logout();
  router.push("/");
}

// Replace any `localStorage.getItem("overload-name")` usage with:
const displayName = user?.name ?? localStorage.getItem("overload-name") ?? "there";
const initials = displayName.charAt(0).toUpperCase();
```

- [ ] **Step 2: Verify build**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
cd frontend
git add components/dashboard/DashboardShell.tsx
git commit -m "feat: dashboard shell uses real auth context for user name and logout"
```

---

## Task 7: Score Card + Check-In

**Files:**
- Modify: `frontend/app/dashboard/page.tsx`
- Modify: `frontend/components/dashboard/ScoreCard.tsx`
- Modify: `frontend/components/dashboard/CheckIn.tsx`
- Modify: `frontend/components/dashboard/ForecastChart.tsx`

**Design:**
- Dashboard page fetches `GET /api/score` and `GET /api/checkins` on mount
- ScoreCard receives `ScoreCardResult` props (no change to its rendering logic — same field names as mock)
- CheckIn posts to `POST /api/checkins`, receives `UpsertCheckInResult`, updates parent state
- ForecastChart derives 7-day view: last 6 days from check-in history + today from score

- [ ] **Step 1: Read dashboard/page.tsx fully**

```bash
# Read the file before editing
```

Run: `cat frontend/app/dashboard/page.tsx`

- [ ] **Step 2: Replace mock data fetching in page.tsx**

Replace the imports from `./data` and the localStorage-based score engine with API calls. Key changes:

```typescript
"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import type { ScoreCardResult, CheckIn, UpsertCheckInResult } from "@/lib/types";
// Keep existing UI component imports

export default function DashboardPage() {
  const { api, user } = useAuth();
  const [scoreCard, setScoreCard] = useState<ScoreCardResult | null>(null);
  const [checkins, setCheckins] = useState<CheckIn[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!api) return;
    async function load() {
      try {
        const [sc, ci] = await Promise.all([
          api!.get<ScoreCardResult>("/api/score"),
          api!.get<CheckIn[]>("/api/checkins"),
        ]);
        setScoreCard(sc);
        setCheckins(ci);
      } catch (e) {
        console.error("Dashboard load failed:", e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [api]);

  function handleCheckInComplete(result: UpsertCheckInResult) {
    // Refresh score card and add new check-in to list
    setScoreCard((prev) => prev ? {
      ...prev,
      score: result.score,
      explanation: result.explanation,
      suggestion: result.suggestion,
      has_checkin: true,
    } : null);
    setCheckins((prev) => [result.check_in, ...prev.filter(c => c.checked_in_date !== result.check_in.checked_in_date)]);
  }

  if (loading) return <div className="dash-loading">Loading…</div>;

  // Build forecast from history + today
  const forecast = buildForecast(scoreCard, checkins);

  return (
    // ... existing JSX, replacing mock data props with scoreCard/checkins/forecast ...
  );
}

/**
 * Derives a 7-day forecast from check-in history + today's score.
 * Shows the last 6 days (from history) plus today (from scorecard).
 * No future-day projection — we don't have a forecast endpoint.
 */
function buildForecast(scoreCard: ScoreCardResult | null, checkins: CheckIn[]) {
  const result = [];
  const today = new Date();
  for (let i = -6; i <= 0; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const dateStr = d.toISOString().split("T")[0];
    const isToday = i === 0;
    const ci = checkins.find((c) => c.checked_in_date === dateStr);
    const score = isToday
      ? (scoreCard?.score.score ?? ci?.score ?? null)
      : ci?.score ?? null;
    if (score !== null) {
      result.push({
        day: d.toLocaleDateString("en-US", { weekday: "short" }),
        date: isToday ? "Today" : d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        score,
        level: scoreLevel(score),
      });
    }
  }
  return result;
}

function scoreLevel(s: number): "ok" | "warning" | "danger" {
  if (s > 65) return "danger";
  if (s > 40) return "warning";
  return "ok";
}
```

- [ ] **Step 3: Update CheckIn.tsx to call POST /api/checkins**

Read `frontend/components/dashboard/CheckIn.tsx` fully, then replace the localStorage save logic:

```typescript
// Add import:
import { useAuth } from "@/contexts/AuthContext";
import type { UpsertCheckInResult } from "@/lib/types";

// Props change — add callback:
interface Props {
  onComplete?: (result: UpsertCheckInResult) => void;
}

// Inside submit handler, replace localStorage.setItem call:
const { api } = useAuth();

async function handleSubmit() {
  if (!stress) return;
  setSubmitting(true);
  try {
    const result = await api!.post<UpsertCheckInResult>("/api/checkins", {
      stress,
      note: note.trim() || undefined,
    });
    onComplete?.(result);
    setSubmitted(true);
  } catch (e) {
    console.error("Check-in failed:", e);
  } finally {
    setSubmitting(false);
  }
}
```

Keep all existing UI/animation code intact. Remove `calculateLiveScore` and localStorage reads.

- [ ] **Step 4: Verify TypeScript**

```bash
cd frontend && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
cd frontend
git add app/dashboard/page.tsx components/dashboard/CheckIn.tsx components/dashboard/ForecastChart.tsx
git commit -m "feat: dashboard fetches real score and check-in data from API"
```

---

## Task 8: History Page

**Files:**
- Modify: `frontend/app/dashboard/history/page.tsx`
- Modify: `frontend/components/dashboard/HistoryChart.tsx`

- [ ] **Step 1: Read history/page.tsx fully**

Run: `cat frontend/app/dashboard/history/page.tsx`

- [ ] **Step 2: Update history page to fetch real data**

```typescript
"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import type { CheckIn } from "@/lib/types";
import HistoryChart from "@/components/dashboard/HistoryChart";

export default function HistoryPage() {
  const { api } = useAuth();
  const [checkins, setCheckins] = useState<CheckIn[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!api) return;
    api.get<CheckIn[]>("/api/checkins")
      .then(setCheckins)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [api]);

  if (loading) return <div className="dash-loading">Loading…</div>;

  // Compute stats for the stats row
  const scores = checkins.map((c) => c.score);
  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const peak = scores.length ? Math.max(...scores) : 0;
  const highStrain = scores.filter((s) => s > 65).length;
  const inZone = scores.filter((s) => s <= 40).length;

  // Map to HistoryDay shape for HistoryChart
  const historyDays = checkins.map((c) => ({
    date: new Date(c.checked_in_date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    score: c.score,
  }));

  return (
    // ... existing JSX layout, passing computed values to stat cards and HistoryChart ...
  );
}
```

Replace `mockCheckIns` references with `checkins`, and `history` import with `historyDays`.

- [ ] **Step 3: Update HistoryChart.tsx to accept CheckIn-derived data**

HistoryChart likely accepts a `data: HistoryDay[]` prop. Verify the prop type and ensure `historyDays` mapping matches. If the chart currently uses `ghost` field, keep it optional.

- [ ] **Step 4: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
cd frontend
git add app/dashboard/history/page.tsx components/dashboard/HistoryChart.tsx
git commit -m "feat: history page fetches real check-in data from API"
```

---

## Task 9: Settings Page

**Files:**
- Modify: `frontend/app/dashboard/settings/page.tsx`

- [ ] **Step 1: Read settings/page.tsx fully**

Run: `cat frontend/app/dashboard/settings/page.tsx`

- [ ] **Step 2: Update settings page**

Replace localStorage reads and mock save handlers with real API calls:

```typescript
"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import type { UserResponse, NotificationPrefs, UpdateProfileRequest } from "@/lib/types";

export default function SettingsPage() {
  const { api, user } = useAuth();
  const [profile, setProfile] = useState<UserResponse | null>(user);
  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!api) return;
    Promise.all([
      api.get<UserResponse>("/api/user"),
      api.get<NotificationPrefs>("/api/notifications/prefs"),
    ]).then(([p, n]) => {
      setProfile(p);
      setNotifPrefs(n);
    }).catch(console.error);
  }, [api]);

  async function saveProfile(updates: UpdateProfileRequest) {
    setSaving(true);
    try {
      const updated = await api!.patch<UserResponse>("/api/user", updates);
      setProfile(updated);
    } finally {
      setSaving(false);
    }
  }

  // NotificationPrefs fields: checkin_reminder, reminder_time, monday_debrief_email,
  // weekly_summary_email, streak_alert_email, pattern_email, re_engage_email
  async function saveNotifPrefs(updates: Partial<NotificationPrefs>) {
    setSaving(true);
    try {
      const updated = await api!.patch<NotificationPrefs>("/api/notifications/prefs", updates);
      setNotifPrefs(updated);
    } finally {
      setSaving(false);
    }
  }

  // Pass profile and notifPrefs to form fields, wire onChange to save handlers
  // ...existing JSX layout preserved...
}
```

- [ ] **Step 3: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
cd frontend
git add app/dashboard/settings/page.tsx
git commit -m "feat: settings page reads and writes profile and notification prefs via API"
```

---

## Task 10: Insights

> **Note:** `GET /api/follow-ups` and `POST /api/follow-ups/{id}/dismiss` exist on the backend but are **out of scope** for this plan. The existing follow-up UI components (`GapReturn.tsx`, `ComebackCard.tsx`, etc.) render from props — wire them to the real API in a follow-up PR once insights are stable.

**Files:**
- Modify: `frontend/components/dashboard/PersonalizedInsight.tsx`
- Modify: `frontend/app/dashboard/page.tsx` (add insights fetch)

- [ ] **Step 1: Read PersonalizedInsight.tsx fully**

Run: `cat frontend/components/dashboard/PersonalizedInsight.tsx`

- [ ] **Step 2: Update PersonalizedInsight to receive real InsightBundle**

Add `GET /api/insights` to the dashboard page's initial load:

```typescript
// In dashboard/page.tsx useEffect, add to Promise.all:
api!.get<InsightBundle>("/api/insights"),
// Destructure as:
const [sc, ci, insights] = await Promise.all([...]);
setInsights(insights);
```

Pass `insights` to `<PersonalizedInsight bundle={insights} />`.

In `PersonalizedInsight.tsx`:
```typescript
// Accept InsightBundle prop, render session_context.message, patterns[0], etc.
// Dismiss handler:
async function dismiss(componentKey: string) {
  await api!.post("/api/insights/dismiss", { component_key: componentKey });
}
```

- [ ] **Step 3: TypeScript check + full test run**

```bash
cd frontend && npx tsc --noEmit && npx vitest run
```

Expected: No type errors, all tests pass.

- [ ] **Step 4: Commit**

```bash
cd frontend
git add components/dashboard/PersonalizedInsight.tsx app/dashboard/page.tsx
git commit -m "feat: personalized insights and follow-ups fetched from API"
```

---

## Task 11: End-to-End Smoke Test

- [ ] **Step 1: Start all services**

```bash
cd /home/nyasha-hama/projects/burnout-predictor
docker compose up --build -d
```

Wait for: `backend_1 | Server listening on :8080` and `frontend_1 | ✓ Ready`.

- [ ] **Step 2: Run full registration flow**

Navigate to `http://localhost:3000`:
1. Click "Get started" → lands on `/login`
2. Sign up (name, email, password) → lands on `/onboarding`
3. Complete onboarding → lands on `/dashboard`
4. Verify: score card shows real score (or "No check-in yet")
5. Submit check-in (stress=3) → score card updates with real score
6. Navigate to `/dashboard/history` → shows submitted check-in
7. Navigate to `/dashboard/settings` → shows real profile data
8. Sign out → lands on `/`
9. Sign back in → skip onboarding, lands on `/dashboard`

- [ ] **Step 3: Remove mock data dead code**

After smoke test passes, clean up `frontend/app/dashboard/data.ts`:
- Keep: `scoreColor`, `scoreLabel`, `SignalLevel`, `HistoryDay`, `ForecastDay`, `CheckInEntry` type exports (still used by some components for display)
- Remove: `mockUser`, `today`, `forecast`, `history`, `mockCheckIns` constant exports

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 4: Final commit**

```bash
cd frontend
git add app/dashboard/data.ts
git commit -m "chore: remove mock data constants, keep shared type exports"
```

---

## Environment Setup Reminder

Ensure `frontend/.env.local` contains:

```
NEXT_PUBLIC_API_URL=http://localhost:8080
```

Ensure `backend/.env` contains at minimum:
```
DATABASE_URL=postgres://postgres:postgres@localhost:5432/burnout_predictor
JWT_SECRET=<any-32-char-string>
PORT=8080
```

Both are set correctly in `docker-compose.yml` for the containerised flow.
