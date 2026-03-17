-- +goose Up
-- +goose StatementBegin

-- ── User notification preferences ────────────────────────────────────────────
-- One row per user. Created with defaults on account creation.
-- All boolean columns default to true (opt-out model for emails).

CREATE TABLE user_notification_prefs (
    user_id                 UUID        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,

    -- in-app reminder (fires at reminder_time in user's timezone)
    checkin_reminder        BOOLEAN     NOT NULL DEFAULT TRUE,
    reminder_time           TIME        NOT NULL DEFAULT '09:00:00',

    -- email digests
    monday_debrief_email    BOOLEAN     NOT NULL DEFAULT TRUE,
    weekly_summary_email    BOOLEAN     NOT NULL DEFAULT TRUE,
    streak_alert_email      BOOLEAN     NOT NULL DEFAULT TRUE,
    pattern_email           BOOLEAN     NOT NULL DEFAULT TRUE,
    re_engage_email         BOOLEAN     NOT NULL DEFAULT TRUE,

    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  user_notification_prefs IS 'Per-user notification opt-in/-out. Upserted on settings save.';
COMMENT ON COLUMN user_notification_prefs.reminder_time IS 'Local time to fire the check-in reminder, in the user''s own timezone.';

-- ── Email send log ────────────────────────────────────────────────────────────
-- Append-only log of all outbound emails. Serves two purposes:
--   1. Deduplication: prevents sending the same template twice in a window
--   2. Debugging: full record of what was sent and when

CREATE TABLE email_logs (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        REFERENCES users(id) ON DELETE SET NULL,
    email           TEXT        NOT NULL,

    -- template identifier (e.g. 'checkin-reminder', 'weekly-debrief')
    template        TEXT        NOT NULL,

    -- deduplication window key (e.g. 'weekly-debrief-2025-W11')
    -- unique within (user_id, dedup_key) to prevent repeat sends
    dedup_key       TEXT,

    -- Resend message ID for tracing
    resend_message_id TEXT,

    -- delivery state
    status          TEXT        NOT NULL DEFAULT 'sent',  -- sent | failed | bounced
    error_message   TEXT,

    sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_email_logs_dedup
    ON email_logs (user_id, dedup_key)
    WHERE dedup_key IS NOT NULL AND status = 'sent';

CREATE INDEX idx_email_logs_user
    ON email_logs (user_id, sent_at DESC);

CREATE INDEX idx_email_logs_template
    ON email_logs (template, sent_at DESC);

COMMENT ON TABLE  email_logs IS 'Append-only log of all outbound emails. unique(user_id, dedup_key) prevents duplicate sends.';
COMMENT ON COLUMN email_logs.dedup_key IS 'Template + time window key. Unique constraint makes sends idempotent.';

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS email_logs CASCADE;
DROP TABLE IF EXISTS user_notification_prefs CASCADE;
-- +goose StatementEnd