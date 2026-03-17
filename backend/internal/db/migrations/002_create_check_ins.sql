-- +goose Up
-- +goose StatementBegin

CREATE TABLE check_ins (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- the local calendar date of the check-in (no time component)
    -- we store the DATE in the user's own timezone, not UTC, so "today"
    -- is always correct regardless of when they check in across timezones.
    checked_in_date     DATE        NOT NULL,

    -- core check-in fields
    stress              SMALLINT    NOT NULL CHECK (stress BETWEEN 1 AND 5),
    note                TEXT        CHECK (char_length(note) <= 280),

    -- computed score stored at write time so history is immutable and
    -- does not need to be re-derived on every dashboard load
    score               SMALLINT    NOT NULL CHECK (score BETWEEN 0 AND 100),

    -- score engine inputs snapshotted at insert time for auditability
    -- and so that changing role/sleep does not silently rewrite history
    role_snapshot       TEXT        NOT NULL DEFAULT 'engineer',
    sleep_snapshot      SMALLINT    NOT NULL DEFAULT 8,
    meeting_count       SMALLINT,   -- from Google Calendar at time of check-in

    -- AI-generated recovery plan; null until generated, cached forever after
    ai_recovery_plan    JSONB,
    ai_generated_at     TIMESTAMPTZ,

    -- lifecycle
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (user_id, checked_in_date)
);

CREATE INDEX idx_check_ins_user_date
    ON check_ins (user_id, checked_in_date DESC);

CREATE INDEX idx_check_ins_ai_pending
    ON check_ins (user_id)
    WHERE ai_recovery_plan IS NULL AND note IS NOT NULL AND stress >= 4;

COMMENT ON TABLE  check_ins IS 'One row per user per calendar day. The atomic unit of all insights.';
COMMENT ON COLUMN check_ins.checked_in_date IS 'Local calendar date in the user''s timezone — not UTC.';
COMMENT ON COLUMN check_ins.score IS 'Cognitive load score 0–100 computed server-side at insert. Higher = more load.';
COMMENT ON COLUMN check_ins.role_snapshot IS 'Role as it was at check-in time; role changes do not rewrite history.';
COMMENT ON COLUMN check_ins.ai_recovery_plan IS 'GPT-4o-mini generated plan stored as [{timing, actions[]}]; generated once.';

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS check_ins CASCADE;
-- +goose StatementEnd