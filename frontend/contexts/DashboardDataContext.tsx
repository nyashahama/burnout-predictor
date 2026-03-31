"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useAuth } from "@/contexts/AuthContext";
import { parseCheckIns, parseInsightBundle, parseScoreCardResult } from "@/lib/validators";
import type { ScoreCardResult, CheckIn, InsightBundle, UpsertCheckInResult } from "@/lib/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

interface DashboardDataContextValue {
  scoreCard: ScoreCardResult | null;
  checkins: CheckIn[];
  insightBundle: InsightBundle | null;
  loadingData: boolean;
  loadingMessage: string;
  loadError: string;
  ready: boolean;
  handleCheckInComplete: (result: UpsertCheckInResult) => void;
  reload: () => Promise<void>;
}

const DashboardDataContext = createContext<DashboardDataContextValue | null>(null);

export function DashboardDataProvider({ children }: { children: React.ReactNode }) {
  const { api, isLoading: authLoading } = useAuth();

  const [scoreCard, setScoreCard]         = useState<ScoreCardResult | null>(null);
  const [checkins, setCheckins]           = useState<CheckIn[]>([]);
  const [insightBundle, setInsightBundle] = useState<InsightBundle | null>(null);
  const [loadingData, setLoadingData]     = useState(true);
  const [loadingMessage, setLoadingMessage] = useState("Connecting to the API…");
  const [loadError, setLoadError]         = useState("");
  const [ready, setReady]                 = useState(false);

  const withTimeout = useCallback(async <T,>(promise: Promise<T>, message: string, timeoutMs: number): Promise<T> => {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  }, []);

  const warmBackend = useCallback(async () => {
    const deadline = Date.now() + 45_000;

    while (Date.now() < deadline) {
      try {
        const res = await fetch(`${API_BASE}/health`, { cache: "no-store" });
        if (res.ok) return;
      } catch {
        // Keep polling while Render spins the service back up.
      }

      await new Promise((resolve) => setTimeout(resolve, 3000));
    }

    throw new Error("The backend is still waking up on Render. Please try again in a moment.");
  }, []);

  const reload = useCallback(async () => {
    if (authLoading || !api) return;
    setLoadingData(true);
    setLoadError("");
    setLoadingMessage("Connecting to the API…");

    const renderTimer = setTimeout(() => {
      setLoadingMessage("Waking up the Render backend…");
    }, 1500);
    const deepseekTimer = setTimeout(() => {
      setLoadingMessage("Still loading your dashboard. The API and DeepSeek response are taking longer than usual.");
    }, 12000);

    try {
      await warmBackend();
      setLoadingMessage("Loading your dashboard data…");

      const [sc, ci] = await withTimeout(
        Promise.all([
          api.get("/api/score", parseScoreCardResult),
          api.get("/api/checkins", parseCheckIns),
        ]),
        "The dashboard took too long to load after the backend woke up.",
        60_000,
      );

      setScoreCard(sc);
      setCheckins(ci);
      setReady(true);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to load dashboard data.");
      setReady(false);
    } finally {
      clearTimeout(renderTimer);
      clearTimeout(deepseekTimer);
      setLoadingData(false);
    }

    try {
      setLoadingMessage("Loading your dashboard insights…");
      const bundle = await api.get("/api/insights", parseInsightBundle);
      setInsightBundle(bundle);
    } catch {
      setInsightBundle(null);
    }
  }, [api, authLoading, warmBackend, withTimeout]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleCheckInComplete = useCallback((result: UpsertCheckInResult) => {
    setScoreCard(prev => prev ? {
      ...prev,
      score: result.score,
      explanation: result.explanation,
      suggestion: result.suggestion,
      daily_forecast: result.daily_forecast,
      recommended_action: result.recommended_action,
      has_checkin: true,
    } : null);
    setCheckins(prev => [
      result.check_in,
      ...prev.filter(c => c.checked_in_date !== result.check_in.checked_in_date),
    ]);
  }, []);

  return (
    <DashboardDataContext.Provider
      value={{
        scoreCard,
        checkins,
        insightBundle,
        loadingData,
        loadingMessage,
        loadError,
        ready,
        handleCheckInComplete,
        reload,
      }}
    >
      {children}
    </DashboardDataContext.Provider>
  );
}

export function useDashboardData(): DashboardDataContextValue {
  const ctx = useContext(DashboardDataContext);
  if (!ctx) throw new Error("useDashboardData must be used inside <DashboardDataProvider>");
  return ctx;
}
