import { describe, it, expectTypeOf } from "vitest";
import type {
  UserResponse,
  ScoreCardResult,
  CheckIn,
  InsightBundle,
  NotificationPrefs,
  AuthResult,
} from "../types";

describe("API types", () => {
  it("UserResponse has required fields", () => {
    expectTypeOf<UserResponse>().toHaveProperty("id");
    expectTypeOf<UserResponse>().toHaveProperty("email");
    expectTypeOf<UserResponse>().toHaveProperty("name");
    expectTypeOf<UserResponse>().toHaveProperty("role");
    expectTypeOf<UserResponse>().toHaveProperty("sleep_baseline");
    expectTypeOf<UserResponse>().toHaveProperty("tier");
  });

  it("ScoreCardResult has score output and has_checkin", () => {
    expectTypeOf<ScoreCardResult>().toHaveProperty("score");
    expectTypeOf<ScoreCardResult>().toHaveProperty("daily_forecast");
    expectTypeOf<ScoreCardResult>().toHaveProperty("recommended_action");
    expectTypeOf<ScoreCardResult>().toHaveProperty("has_checkin");
    expectTypeOf<ScoreCardResult>().toHaveProperty("streak");
  });

  it("AuthResult has tokens and user", () => {
    expectTypeOf<AuthResult>().toHaveProperty("access_token");
    expectTypeOf<AuthResult>().toHaveProperty("refresh_token");
    expectTypeOf<AuthResult>().toHaveProperty("user");
  });

  it("NotificationPrefs has correct backend field names", () => {
    expectTypeOf<NotificationPrefs>().toHaveProperty("checkin_reminder");
    expectTypeOf<NotificationPrefs>().toHaveProperty("reminder_time");
    expectTypeOf<NotificationPrefs>().toHaveProperty("monday_debrief_email");
  });

  it("InsightBundle has all 12 fields", () => {
    expectTypeOf<InsightBundle>().toHaveProperty("session_context");
    expectTypeOf<InsightBundle>().toHaveProperty("earned_pattern");
    expectTypeOf<InsightBundle>().toHaveProperty("signature");
    expectTypeOf<InsightBundle>().toHaveProperty("monthly_arc");
    expectTypeOf<InsightBundle>().toHaveProperty("milestone");
    expectTypeOf<InsightBundle>().toHaveProperty("patterns");
    expectTypeOf<InsightBundle>().toHaveProperty("pattern_insights");
    expectTypeOf<InsightBundle>().toHaveProperty("recovery_feedback");
    expectTypeOf<InsightBundle>().toHaveProperty("dismissed_components");
  });
});
