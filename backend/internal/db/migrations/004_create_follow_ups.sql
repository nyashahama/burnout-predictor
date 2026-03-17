-- +goose Up
-- +goose StatementBegin

-- ── Follow-up questions ───────────────────────────────────────────────────────
-- When a user mentions a future event in their note (deadline, presentation,
-- interview, launch, travel...) we parse the event, compute the day *after*
-- that event, and store a follow-up here. The dashboard surfaces it on that
-- fire_date with a contextual question: "The deadline you mentioned — how did
-- it land?"
--
-- This table replaces the localStorage followup-{date} pattern from the
-- frontend.

CREATE TABLE follow_ups (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- the date the follow-up should surface on the dashboard
    fire_date       DATE        NOT NULL,

    -- event classification (deadline | presentation | demo | interview |
    -- launch | travel | meeting)
    event_type      TEXT        NOT NULL,

    -- the rendered question to show
    question        TEXT        NOT NULL,

    -- short excerpt from the note that triggered this (≤80 chars)
    note_snippet    TEXT,

    -- the check-in that generated this follow-up
    source_checkin_id UUID      REFERENCES check_ins(id) ON DELETE SET NULL,

    -- lifecycle tracking
    surfaced_at     TIMESTAMPTZ,            -- null until displayed to user
    dismissed_at    TIMESTAMPTZ,            -- null until user dismisses it
    expired_at      TIMESTAMPTZ,            -- set by cleanup cron if never surfaced

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- one follow-up per event type per fire date per user
    UNIQUE (user_id, fire_date, event_type)
);

CREATE INDEX idx_follow_ups_user_fire
    ON follow_ups (user_id, fire_date)
    WHERE surfaced_at IS NULL AND dismissed_at IS NULL AND expired_at IS NULL;

COMMENT ON TABLE  follow_ups IS 'Forward-looking memory: events parsed from notes surfaced the day after they happen.';
COMMENT ON COLUMN follow_ups.fire_date IS 'The day the follow-up question appears — typically one day after the mentioned event.';
COMMENT ON COLUMN follow_ups.note_snippet IS 'Shown verbatim in the dashboard: "Yesterday you wrote: «big deadline»"';

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS follow_ups CASCADE;
-- +goose StatementEnd