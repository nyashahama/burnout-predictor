-- +goose Up
-- +goose StatementBegin

-- ── Insight metadata ──────────────────────────────────────────────────────────
-- Key-value store for per-user insight state that needs to persist across
-- devices. Replaces the localStorage pattern for:
--   pattern-seen-dow-{N}            → day-of-week pattern discovery cooldowns
--   recovery-milestone-clean7       → milestone fire-once flags
--   recovery-milestone-best7avg     → milestone fire-once with best value
--   debrief-{year}-W{week}          → cached Monday debrief narrative
--
-- The value column is TEXT so it can hold a date string, a float, or a
-- JSON blob — callers decide how to serialise.

CREATE TABLE insight_metadata (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- namespaced key, e.g. 'pattern-seen-dow-2', 'debrief-2025-W11'
    key         TEXT        NOT NULL,
    value       TEXT,

    set_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (user_id, key)
);

CREATE INDEX idx_insight_metadata_user
    ON insight_metadata (user_id);

COMMENT ON TABLE  insight_metadata IS 'Per-user insight cooldowns, fire-once flags, and cached AI narratives. Replaces localStorage.';
COMMENT ON COLUMN insight_metadata.key IS 'Namespaced key. Prefix conventions: pattern-seen-, recovery-milestone-, debrief-.';

-- ── Dismissed UI components ───────────────────────────────────────────────────
-- Tracks components the user has explicitly dismissed so they don't
-- re-appear on other devices or after a browser clear.
-- Primary use case: the Monday debrief card (dismissable, weekly cadence).

CREATE TABLE dismissed_components (
    user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- e.g. 'monday-debrief-2025-W11', 'burnout-alert-2025-03-13'
    component_key   TEXT        NOT NULL,

    dismissed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (user_id, component_key)
);

CREATE INDEX idx_dismissed_user
    ON dismissed_components (user_id);

COMMENT ON TABLE dismissed_components IS 'Records which ephemeral UI cards the user has dismissed, cross-device.';
COMMENT ON COLUMN dismissed_components.component_key IS 'Scoped key including a date/week to auto-expire old dismissals.';

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS dismissed_components CASCADE;
DROP TABLE IF EXISTS insight_metadata CASCADE;
-- +goose StatementEnd