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
}

export interface ApiError {
  error: string;
}
