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

export type RecommendationState = "generic" | "observed" | "emerging" | "confirmed";
export type PersonalizationKind = "trigger" | "recovery" | "experiment";

export type RecommendationTargetDay = "today" | "tomorrow";

export interface BriefingActionCandidate {
  key: string;
  title: string;
  detail: string;
  timeframe: RecommendationTargetDay;
  kind: PersonalizationKind;
  state: RecommendationState;
}

export interface BriefingRecommendation {
  headline: string;
  target_day: RecommendationTargetDay;
  primary_action: BriefingActionCandidate;
  fallback_action: BriefingActionCandidate | null;
  predicted_score_delta: number;
  risk_reduction_summary: string;
  why_this_action: string;
  why_now: string;
  confidence: RecommendationState | "generic";
  basis: RecommendationBasis | null;
}

export interface RecommendationBasis {
  kind: PersonalizationKind;
  state: RecommendationState;
  summary: string;
  evidence_count: number;
}

export interface BriefingChange {
  title: string;
  body: string;
}

export interface PersonalizationProgressSummary {
  confirmed_triggers: number;
  confirmed_recovery_levers: number;
  experiments: number;
  confidence_trend: string;
}

export interface PlaybookItem {
  key: string;
  title: string;
  detail: string;
  kind: PersonalizationKind;
  state: RecommendationState;
  evidence_count: number;
  last_seen_date: string;
  trend: string;
}

export interface PlaybookSections {
  confirmed_triggers: PlaybookItem[];
  confirmed_recovery_levers: PlaybookItem[];
  experiments: PlaybookItem[];
}

export type InsightConfidence = "low" | "medium" | "high";
export type ForecastDirection = "down" | "stable" | "up";

export interface DailyForecast {
  score: number;
  delta: number;
  direction: ForecastDirection;
  confidence: InsightConfidence;
  summary: string;
}

export interface RecommendedAction {
  title: string;
  detail: string;
  driver: string;
  confidence: InsightConfidence;
}

export interface FollowUpInfo {
  question: string;
  source_date: string;
}

export interface StreakMilestone {
  day: number;
  message: string;
}

export interface WhatWorkedToday {
  action: string;
  improvement: number;
  evidence: string;
}

export interface PatternInsightCard {
  title: string;
  explanation: string;
  evidence: string;
  driver: string;
  confidence: InsightConfidence;
}

export interface RecoveryFeedback {
  title: string;
  explanation: string;
  evidence: string;
  driver: string;
  confidence: InsightConfidence;
  average_improvement: number;
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
  onboarded: boolean;
}

export interface AuthResult {
  access_token: string;
  user: UserResponse;
}

export interface RefreshResult {
  access_token: string;
}

export interface DashboardBootstrap {
  user: UserResponse;
  score_card: ScoreCardResult;
  checkins: CheckIn[];
  insight_bundle: InsightBundle;
  follow_up: FollowUpInfo | null;
}

export interface ScoreCardResult {
  score: ScoreOutput;
  explanation: string;
  suggestion: string;
  daily_forecast: DailyForecast;
  recommended_action: RecommendedAction;
  trajectory: string;
  accuracy_label: string;
  streak: number;
  has_checkin: boolean;
  consistency_pct: number;
  has_follow_up: boolean;
  follow_up: FollowUpInfo | null;
  streak_forgiven: boolean;
  streak_milestones: StreakMilestone[];
  feedback_submitted_for_today: string | null;
}

export interface CheckIn {
  id: string;
  user_id: string;
  checked_in_date: string;         // "YYYY-MM-DD" — pgtype.Date marshals to date string
  stress: number;                   // int16
  score: number;                    // int16
  note: string | null;              // pgtype.Text marshals to string or null
  role_snapshot: string;
  sleep_snapshot: number;
  meeting_count: number | null;     // pgtype.Int2
  ai_recovery_plan: string | null;  // []byte base64 or null
  ai_generated_at: string | null;   // pgtype.Timestamptz ISO string or null
  created_at: string;
  updated_at: string;
  energy_level: number | null;      // pgtype.Int2
  focus_quality: number | null;     // pgtype.Int2
  hours_worked: number | null;      // pgtype.Numeric
  physical_symptoms: string[] | null;
  small_wins: string | null;
}

export interface UpsertCheckInRequest {
  stress: number;
  note: string;   // always send, use "" when empty
  energy_level?: number;
  focus_quality?: number;
  hours_worked?: number;
  physical_symptoms?: string[];
  small_wins?: string;
}

export interface UpsertCheckInResult {
  check_in: CheckIn;
  score: ScoreOutput;
  explanation: string;
  suggestion: string;
  daily_forecast: DailyForecast;
  recommended_action: RecommendedAction;
  recovery_plan?: PlanSection[];
}

export interface SessionContext {
  Message: string;
  Kind: "drop" | "rise" | "note_reference" | "neutral";
}

export type Trend = "improving" | "stable" | "worsening";

export interface EarnedPatternInsight {
  // Go: score.EarnedPatternInsightResult — no json tags, capitalized field names
  Message: string;
  DOW: number; // 0–6 day of week
}

export interface SignatureData {
  // Go: score.SignatureData — no json tags, capitalized field names
  HardestDay: string | null;
  EasiestDay: string | null;
  TopTrigger: string | null;
  TriggerLift: number;
  AvgScore: number;
  RecoveryDays: number | null;
  Trend: Trend;
}

export interface MonthlyArcResult {
  // Go: score.MonthlyArcResult — no json tags, capitalized field names
  CurrentAvg: number;
  PreviousAvg: number;
  Delta: number;
  MonthName: string;
  Message: string;
}

export interface MilestoneData {
  // Go: score.MilestoneData — no json tags, capitalized field names
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

export type CommitmentStatus = "committed" | "completed" | "skipped" | "expired" | "evaluated";
export type OutcomeHelpfulness = "helped" | "a_bit" | "did_not_help";

export interface RecommendationCommitment {
  id: string;
  recommendation_key: string;
  recommendation_title: string;
  recommendation_detail: string;
  why_this_action: string;
  why_now: string;
  target_day: RecommendationTargetDay;
  status: CommitmentStatus;
  predicted_score_delta: number;
  committed_at: string;
  due_at: string;
  completed_at: string | null;
  outcome_helpfulness: OutcomeHelpfulness | null;
  evaluated_at: string | null;
  basis: RecommendationBasis | null;
}

export interface PendingOutcomePrompt {
  commitment_id: string;
  recommendation_title: string;
  prompt: string;
}

export interface InsightBundle {
  session_context: SessionContext | null;
  patterns: string[];
  pattern_insights: PatternInsightCard[];
  earned_pattern: EarnedPatternInsight | null;
  signature: SignatureData | null;
  signature_narrative: string;
  arc_narrative: string;
  monthly_arc: MonthlyArcResult | null;
  what_works: string;
  recovery_feedback: RecoveryFeedback[];
  milestone: MilestoneData | null;
  check_in_count: number; // Go int64 — safe as number for realistic check-in counts (well below 2^53)
  accuracy_label: string;
  dismissed_components: string[];
  what_worked_today: WhatWorkedToday | null;
  streak_milestones: StreakMilestone[];
  streak_forgiven: boolean;
  personalization_progress: PersonalizationProgressSummary;
  recommendation_basis: RecommendationBasis | null;
  briefing_change: BriefingChange | null;
  playbook: PlaybookSections;
  briefing_recommendation: BriefingRecommendation | null;
  active_commitment: RecommendationCommitment | null;
  pending_outcome_prompt: PendingOutcomePrompt | null;
}

// NotificationPrefs matches handler.NotifPrefsResponse exactly.
export interface NotificationPrefs {
  checkin_reminder: boolean;
  reminder_time: string;           // "HH:MM"
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
  estimated_score?: number;
}

export interface ApiError {
  error: string;
}

export interface BankDetails {
  account_name: string;
  bank_name: string;
  account_number: string;
  branch_code: string;
  account_type: string;
}

export interface InitPaymentResponse {
  payment_id: string;
  reference: string;
  amount_cents: number;
  currency: string;
  plan_name: string;
  expires_at: string;
  bank_details: BankDetails;
}

export interface PendingPayment {
  id: string;
  user_id: string;
  user_email: string;
  user_name: string;
  reference: string;
  amount_cents: number;
  currency: string;
  plan_name: string;
  status: string;
  proof_image_url?: string;
  created_at: string;
  expires_at: string;
}

export interface PendingPaymentsResponse {
  payments: PendingPayment[];
}
