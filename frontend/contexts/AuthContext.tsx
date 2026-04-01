// frontend/contexts/AuthContext.tsx
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { ApiClient, createApiClient } from "@/lib/api";
import {
  storeTokens,
  getRefreshToken,
  getAccessToken,
  clearTokens,
  setSessionCookie,
  setOnboardedCookie,
  clearSessionCookie,
} from "@/lib/auth";
import { parseAuthResult, parseRefreshResult, parseUserResponse } from "@/lib/validators";
import type { AuthResult, RefreshResult, UserResponse } from "@/lib/types";

interface AuthContextValue {
  user: UserResponse | null;
  api: ApiClient;
  isLoading: boolean;
  login: (result: AuthResult) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const handleUnauthenticated = useCallback(() => {
    clearTokens();
    void clearSessionCookie();
    setUser(null);
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
  }, []);

  // Build the ApiClient once, injecting a live token getter closure.
  const api = useMemo(
    () => createApiClient(() => getAccessToken(), handleUnauthenticated),
    [handleUnauthenticated]
  );

  const login = useCallback(async (result: AuthResult) => {
    storeTokens(result.access_token, result.refresh_token);
    await setSessionCookie();
    setUser(result.user);
  }, []);

  const refreshSession = useCallback(async (): Promise<boolean> => {
    const rt = getRefreshToken();
    if (!rt) return false;
    try {
      const res = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: rt }),
      });
      if (!res.ok) return false;
      const data = parseRefreshResult((await res.json()) as RefreshResult);
      // Rotate both tokens — new refresh token replaces old one in localStorage.
      storeTokens(data.access_token, data.refresh_token);
      return true;
    } catch {
      return false;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/api/auth/logout");
    } catch {
      // Ignore — clear client-side state regardless.
    }
    clearTokens();
    await clearSessionCookie();
    setUser(null);
  }, [api]);

  // On mount: try to restore session from stored refresh token.
  useEffect(() => {
    let cancelled = false;

    async function restore() {
      const rt = getRefreshToken();
      if (!rt) {
        if (!cancelled) setIsLoading(false);
        return;
      }

      const ok = await refreshSession();
      if (cancelled) return;

      if (ok) {
        try {
          const profile = await api.get("/api/user", parseUserResponse);
          if (!cancelled) {
            setUser(profile);
            await setOnboardedCookie();
          }
        } catch {
          clearTokens();
          await clearSessionCookie();
        }
      } else {
        clearTokens();
        await clearSessionCookie();
      }

      if (!cancelled) setIsLoading(false);
    }

    restore();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
