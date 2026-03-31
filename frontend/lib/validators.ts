import type {
  AuthResult,
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
  };
}

export const parseUserResponse = (value: unknown): UserResponse => parseUser(value);

export const parseRefreshResult = (value: unknown): RefreshResult => {
  if (!isRecord(value)) throw new Error("Invalid API response: refresh payload must be an object.");
  return {
    access_token: expectString(value.access_token, "access_token"),
    refresh_token: expectString(value.refresh_token, "refresh_token"),
  };
};

export const parseAuthResult = (value: unknown): AuthResult => {
  if (!isRecord(value)) throw new Error("Invalid API response: auth payload must be an object.");
  return {
    access_token: expectString(value.access_token, "access_token"),
    refresh_token: expectString(value.refresh_token, "refresh_token"),
    user: parseUser(value.user),
  };
};

export const parseScoreCardResult = (value: unknown): ScoreCardResult => {
  if (!isRecord(value) || !isRecord(value.score)) {
    throw new Error("Invalid API response: score card payload is malformed.");
  }
  return value as ScoreCardResult;
};

export const parseCheckIn = (value: unknown, field = "check_in"): CheckIn => {
  if (!isRecord(value)) throw new Error(`Invalid API response: ${field} must be an object.`);
  return value as CheckIn;
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
  if (!Array.isArray(value.patterns) || !Array.isArray(value.dismissed_components)) {
    throw new Error("Invalid API response: insight bundle arrays are malformed.");
  }
  return value as InsightBundle;
};
