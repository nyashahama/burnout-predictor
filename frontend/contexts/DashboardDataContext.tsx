"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useAuth } from "@/contexts/AuthContext";
import type { ScoreCardResult, CheckIn, InsightBundle, UpsertCheckInResult } from "@/lib/types";

interface DashboardDataContextValue {
  scoreCard: ScoreCardResult | null;
  checkins: CheckIn[];
  insightBundle: InsightBundle | null;
  loadingData: boolean;
  ready: boolean;
  handleCheckInComplete: (result: UpsertCheckInResult) => void;
}

const DashboardDataContext = createContext<DashboardDataContextValue | null>(null);

export function DashboardDataProvider({ children }: { children: React.ReactNode }) {
  const { api, isLoading: authLoading } = useAuth();

  const [scoreCard, setScoreCard]         = useState<ScoreCardResult | null>(null);
  const [checkins, setCheckins]           = useState<CheckIn[]>([]);
  const [insightBundle, setInsightBundle] = useState<InsightBundle | null>(null);
  const [loadingData, setLoadingData]     = useState(true);
  const [ready, setReady]                 = useState(false);

  useEffect(() => {
    if (authLoading || !api) return;
    Promise.all([
      api.get<ScoreCardResult>("/api/score"),
      api.get<CheckIn[]>("/api/checkins"),
    ])
      .then(([sc, ci]) => {
        setScoreCard(sc);
        setCheckins(ci);
        setReady(true);
      })
      .catch(console.error)
      .finally(() => setLoadingData(false));

    api.get<InsightBundle>("/api/insights")
      .then(setInsightBundle)
      .catch(console.error);
  }, [api, authLoading]);

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
      value={{ scoreCard, checkins, insightBundle, loadingData, ready, handleCheckInComplete }}
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
