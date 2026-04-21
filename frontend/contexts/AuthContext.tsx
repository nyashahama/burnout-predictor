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
  getAccessToken,
  clearTokens,
  setSessionCookie,
  setOnboardedCookie,
  clearSessionCookie,
} from "@/lib/auth";
import { parseRefreshResult, parseUserResponse } from "@/lib/validators";
import type { AuthResult, RefreshResult, UserResponse } from "@/lib/types";

interface AuthContextValue {
  user: UserResponse | null;
  api: ApiClient;
  isLoading: boolean;
  login: (result: AuthResult) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<boolean>;
  updateUser: (user: UserResponse) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const AUTH_BASE = "/api/auth";
let refreshInFlight: Promise<boolean> | null = null;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const syncUserCache = useCallback((nextUser: UserResponse | null) => {
    if (typeof window === "undefined") return;
    if (!nextUser) return;

    localStorage.setItem("overload-name", nextUser.name);
    localStorage.setItem("overload-role", nextUser.role);
    localStorage.setItem("overload-sleep", String(nextUser.sleep_baseline));
  }, []);

  const handleUnauthenticated = useCallback(() => {
    clearTokens();
    void clearSessionCookie();
    setUser(null);
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
  }, []);

  const login = useCallback(async (result: AuthResult) => {
    storeTokens(result.access_token);
    if (result.user.onboarded) {
      await setOnboardedCookie();
    } else {
      await setSessionCookie();
    }
    setUser(result.user);
    syncUserCache(result.user);
  }, [syncUserCache]);

  const refreshSession = useCallback(async (): Promise<boolean> => {
    if (refreshInFlight) return refreshInFlight;
    refreshInFlight = (async () => {
      try {
        const res = await fetch(`${AUTH_BASE}/refresh`, { method: "POST" });
        if (!res.ok) return false;
        const data = parseRefreshResult((await res.json()) as RefreshResult);
        storeTokens(data.access_token);
        return true;
      } catch {
        return false;
      } finally {
        refreshInFlight = null;
      }
    })();
    return refreshInFlight;
  }, []);

  // Build the ApiClient once, injecting a live token getter closure.
  const api = useMemo(
    () => createApiClient(() => getAccessToken(), handleUnauthenticated, refreshSession),
    [handleUnauthenticated, refreshSession]
  );

  const logout = useCallback(async () => {
    try {
      await api.post("/api/auth/logout");
    } catch {
      // Ignore — clear client-side state regardless.
    }
    await fetch(`${AUTH_BASE}/logout`, { method: "POST" });
    clearTokens();
    await clearSessionCookie();
    setUser(null);
  }, [api]);

  const updateUser = useCallback((nextUser: UserResponse) => {
    setUser(nextUser);
    syncUserCache(nextUser);
  }, [syncUserCache]);

  // On mount: try to restore session from stored refresh token.
  useEffect(() => {
    let cancelled = false;

    async function restore() {
      const ok = await refreshSession();
      if (cancelled) return;

      if (ok) {
        try {
          const profile = await api.get("/api/user", parseUserResponse);
          if (!cancelled) {
            updateUser(profile);
            if (profile.onboarded) {
              await setOnboardedCookie();
            } else {
              await setSessionCookie();
            }
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
    <AuthContext.Provider value={{ user, api, isLoading, login, logout, refreshSession, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
