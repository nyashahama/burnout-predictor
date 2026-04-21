import type {
  AuthResult,
  DashboardBootstrap,
  CheckIn,
  InsightBundle,
  NotificationPrefs,
  RefreshResult,
  ScoreCardResult,
  UserResponse,
} from "./types";

type Validator<T> = (value: unknown, field?: string) => T;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function expectString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`Invalid API response: ${field} must be a string.`);
  }
  return value;
}

function expectNumber(value: unknown, field: string): number {
  if (typeof value !== "number") {
    throw new Error(`Invalid API response: ${field} must be a number.`);
  }
  return value;
}

function expectBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`Invalid API response: ${field} must be a boolean.`);
  }
  return value;
}

function expectArray<T>(value: unknown, field: string, itemValidator: Validator<T>): T[] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid API response: ${field} must be an array.`);
  }
  return value.map((item, index) => itemValidator(item, `${field}[${index}]`));
}

function parseUser(value: unknown, field = "user"): UserResponse {
  if (!isRecord(value)) throw new Error(`Invalid API response: ${field} must be an object.`);
  return {
    id: expectString(value.id, `${field}.id`),
    email: expectString(value.email, `${field}.email`),
    name: expectString(value.name, `${field}.name`),
    role: expectString(value.role, `${field}.role`),
    sleep_baseline: expectNumber(value.sleep_baseline, `${field}.sleep_baseline`),
    timezone: expectString(value.timezone, `${field}.timezone`),
    email_verified: expectBoolean(value.email_verified, `${field}.email_verified`),
    tier: expectString(value.tier, `${field}.tier`),
    calendar_connected: expectBoolean(value.calendar_connected, `${field}.calendar_connected`),
    onboarded: expectBoolean(value.onboarded, `${field}.onboarded`),
  };
}

export const parseUserResponse = (value: unknown): UserResponse => parseUser(value);

export const parseRefreshResult = (value: unknown): RefreshResult => {
  if (!isRecord(value)) throw new Error("Invalid API response: refresh payload must be an object.");
  return {
    access_token: expectString(value.access_token, "access_token"),
  };
};

export const parseAuthResult = (value: unknown): AuthResult => {
  if (!isRecord(value)) throw new Error("Invalid API response: auth payload must be an object.");
  return {
    access_token: expectString(value.access_token, "access_token"),
    user: parseUser(value.user),
  };
};

export const parseDashboardBootstrap = (value: unknown): DashboardBootstrap => {
  if (!isRecord(value)) throw new Error("Invalid API response: bootstrap payload must be an object.");
  return {
    user: parseUser(value.user),
    score_card: parseScoreCardResult(value.score_card),
    checkins: parseCheckIns(value.checkins),
    insight_bundle: parseInsightBundle(value.insight_bundle),
    follow_up: isRecord(value.follow_up)
      ? {
          question: expectString(value.follow_up.question, "follow_up.question"),
          source_date: expectString(value.follow_up.source_date, "follow_up.source_date"),
        }
      : null,
  };
};

export const parseScoreCardResult = (value: unknown): ScoreCardResult => {
  if (!isRecord(value) || !isRecord(value.score) || !isRecord(value.daily_forecast) || !isRecord(value.recommended_action)) {
    throw new Error("Invalid API response: score card payload is malformed.");
  }
  return value as unknown as ScoreCardResult;
};

export const parseCheckIn = (value: unknown, field = "check_in"): CheckIn => {
  if (!isRecord(value)) throw new Error(`Invalid API response: ${field} must be an object.`);
  return value as unknown as CheckIn;
};

export const parseCheckIns = (value: unknown): CheckIn[] =>
  expectArray(value, "checkins", (item) => parseCheckIn(item));

export const parseNotificationPrefs = (value: unknown): NotificationPrefs => {
  if (!isRecord(value)) throw new Error("Invalid API response: notification prefs must be an object.");
  return {
    checkin_reminder: expectBoolean(value.checkin_reminder, "checkin_reminder"),
    reminder_time: expectString(value.reminder_time, "reminder_time"),
    monday_debrief_email: expectBoolean(value.monday_debrief_email, "monday_debrief_email"),
    weekly_summary_email: expectBoolean(value.weekly_summary_email, "weekly_summary_email"),
    streak_alert_email: expectBoolean(value.streak_alert_email, "streak_alert_email"),
    pattern_email: expectBoolean(value.pattern_email, "pattern_email"),
    re_engage_email: expectBoolean(value.re_engage_email, "re_engage_email"),
  };
};

export const parseInsightBundle = (value: unknown): InsightBundle => {
  if (!isRecord(value)) throw new Error("Invalid API response: insight bundle must be an object.");
  if (!Array.isArray(value.patterns)) throw new Error("Invalid API response: patterns must be an array.");
  if (!Array.isArray(value.pattern_insights)) throw new Error("Invalid API response: pattern_insights must be an array.");
  if (!Array.isArray(value.recovery_feedback)) throw new Error("Invalid API response: recovery_feedback must be an array.");
  if (!Array.isArray(value.dismissed_components)) throw new Error("Invalid API response: dismissed_components must be an array.");
  const bundle = value as Partial<InsightBundle> & Record<string, unknown>;

  return {
    ...bundle,
    personalization_progress: isRecord(bundle.personalization_progress)
      ? (bundle.personalization_progress as InsightBundle["personalization_progress"])
      : {
          confirmed_triggers: 0,
          confirmed_recovery_levers: 0,
          experiments: 0,
          confidence_trend: "flat",
        },
    playbook: isRecord(bundle.playbook)
      ? (bundle.playbook as InsightBundle["playbook"])
      : {
          confirmed_triggers: [],
          confirmed_recovery_levers: [],
          experiments: [],
        },
    recommendation_basis: isRecord(bundle.recommendation_basis)
      ? (bundle.recommendation_basis as InsightBundle["recommendation_basis"])
      : null,
    briefing_change: isRecord(bundle.briefing_change)
      ? (bundle.briefing_change as InsightBundle["briefing_change"])
      : null,
    briefing_recommendation: isRecord(bundle.briefing_recommendation)
      ? (bundle.briefing_recommendation as InsightBundle["briefing_recommendation"])
      : null,
    active_commitment: isRecord(bundle.active_commitment)
      ? (bundle.active_commitment as InsightBundle["active_commitment"])
      : null,
    pending_outcome_prompt: isRecord(bundle.pending_outcome_prompt)
      ? (bundle.pending_outcome_prompt as InsightBundle["pending_outcome_prompt"])
      : null,
  } as InsightBundle;
};
