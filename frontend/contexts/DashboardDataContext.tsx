"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  parseDashboardBootstrap,
} from "@/lib/validators";
import type {
  ScoreCardResult,
  CheckIn,
  InsightBundle,
  UpsertCheckInResult,
  FollowUpInfo,
} from "@/lib/types";

interface DashboardDataContextValue {
  scoreCard: ScoreCardResult | null;
  checkins: CheckIn[];
  insightBundle: InsightBundle | null;
  loadingData: boolean;
  loadingMessage: string;
  loadError: string;
  ready: boolean;
  followUp: FollowUpInfo | null;
  dismissFollowUp: () => Promise<void>;
  handleCheckInComplete: (result: UpsertCheckInResult) => void;
  reload: () => Promise<void>;
  commitRecommendation: () => Promise<void>;
  completeCommitment: (id: string) => Promise<void>;
  skipCommitment: (id: string) => Promise<void>;
  submitCommitmentOutcome: (
    id: string,
    helpfulness: "helped" | "a_bit" | "did_not_help",
  ) => Promise<void>;
}

const DashboardDataContext = createContext<DashboardDataContextValue | null>(
  null,
);

export function DashboardDataProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { api, isLoading: authLoading } = useAuth();

  const [scoreCard, setScoreCard] = useState<ScoreCardResult | null>(null);
  const [checkins, setCheckins] = useState<CheckIn[]>([]);
  const [insightBundle, setInsightBundle] = useState<InsightBundle | null>(
    null,
  );
  const [followUp, setFollowUp] = useState<FollowUpInfo | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState(
    "Connecting to the API…",
  );
  const [loadError, setLoadError] = useState("");
  const [ready, setReady] = useState(false);

  const withTimeout = useCallback(
    async <T,>(
      promise: Promise<T>,
      message: string,
      timeoutMs: number,
    ): Promise<T> => {
      return Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          setTimeout(() => reject(new Error(message)), timeoutMs);
        }),
      ]);
    },
    [],
  );

  const reload = useCallback(async () => {
    if (authLoading) return;
    setLoadingData(true);
    setLoadError("");
    setLoadingMessage("Loading your dashboard…");

    try {
      const response = await withTimeout(
        fetch("/api/dashboard/bootstrap", { cache: "no-store" }),
        "The dashboard took too long to load.",
        15_000,
      );
      if (!response.ok) {
        throw new Error("Failed to load dashboard data.");
      }
      const bootstrap = parseDashboardBootstrap(await response.json());
      setScoreCard(bootstrap.score_card);
      setCheckins(bootstrap.checkins);
      setInsightBundle(bootstrap.insight_bundle);
      setFollowUp(bootstrap.follow_up);
      setReady(true);
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : "Failed to load dashboard data.",
      );
      setReady(false);
    } finally {
      setLoadingData(false);
    }
  }, [authLoading, withTimeout]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const dismissFollowUp = useCallback(async () => {
    try {
      await api.post("/api/follow-ups/dismiss-today", {});
      setFollowUp(null);
    } catch {}
  }, [api]);

  const handleCheckInComplete = useCallback(
    (result: UpsertCheckInResult) => {
      setScoreCard((prev) =>
        prev
          ? {
              ...prev,
              score: result.score,
              explanation: result.explanation,
              suggestion: result.suggestion,
              daily_forecast: result.daily_forecast,
              recommended_action: result.recommended_action,
              has_checkin: true,
            }
          : null,
      );
      setCheckins((prev) => [
        result.check_in,
        ...prev.filter(
          (c) => c.checked_in_date !== result.check_in.checked_in_date,
        ),
      ]);
      void reload();
    },
    [reload],
  );

  const commitRecommendation = useCallback(async () => {
    await api.post("/api/recommendations/commit", {});
    await reload();
  }, [api, reload]);

  const completeCommitment = useCallback(
    async (id: string) => {
      await api.post(`/api/recommendations/${id}/complete`, {});
      await reload();
    },
    [api, reload],
  );

  const skipCommitment = useCallback(
    async (id: string) => {
      await api.post(`/api/recommendations/${id}/skip`, {});
      await reload();
    },
    [api, reload],
  );

  const submitCommitmentOutcome = useCallback(
    async (id: string, helpfulness: "helped" | "a_bit" | "did_not_help") => {
      await api.post(`/api/recommendations/${id}/outcome`, { helpfulness });
      await reload();
    },
    [api, reload],
  );

  return (
    <DashboardDataContext.Provider
      value={{
        scoreCard,
        checkins,
        insightBundle,
        followUp,
        dismissFollowUp,
        loadingData,
        loadingMessage,
        loadError,
        ready,
        handleCheckInComplete,
        reload,
        commitRecommendation,
        completeCommitment,
        skipCommitment,
        submitCommitmentOutcome,
      }}
    >
      {children}
    </DashboardDataContext.Provider>
  );
}

export function useDashboardData(): DashboardDataContextValue {
  const ctx = useContext(DashboardDataContext);
  if (!ctx)
    throw new Error(
      "useDashboardData must be used inside <DashboardDataProvider>",
    );
  return ctx;
}
