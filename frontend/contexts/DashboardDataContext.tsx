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

interface DashboardDataContextValue {
  scoreCard: ScoreCardResult | null;
  checkins: CheckIn[];
  insightBundle: InsightBundle | null;
  loadingData: boolean;
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
  const [loadError, setLoadError]         = useState("");
  const [ready, setReady]                 = useState(false);

  const withTimeout = useCallback(async <T,>(promise: Promise<T>, message: string): Promise<T> => {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        setTimeout(() => reject(new Error(message)), 5000);
      }),
    ]);
  }, []);

  const reload = useCallback(async () => {
    if (authLoading || !api) return;
    setLoadingData(true);
    setLoadError("");

    try {
      const [sc, ci] = await withTimeout(
        Promise.all([
          api.get("/api/score", parseScoreCardResult),
          api.get("/api/checkins", parseCheckIns),
        ]),
        "Dashboard data took too long to load.",
      );

      setScoreCard(sc);
      setCheckins(ci);
      setReady(true);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to load dashboard data.");
      setReady(false);
    } finally {
      setLoadingData(false);
    }

    try {
      const bundle = await api.get("/api/insights", parseInsightBundle);
      setInsightBundle(bundle);
    } catch {
      setInsightBundle(null);
    }
  }, [api, authLoading, withTimeout]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleCheckInComplete = useCallback((result: UpsertCheckInResult) => {
    setScoreCard(prev => prev ? {
      ...prev,
      score: result.score,
      explanation: result.explanation,
      suggestion: result.suggestion,
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
