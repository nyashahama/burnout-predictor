-- +goose Up
-- +goose StatementBegin

-- ── updated_at trigger function ───────────────────────────────────────────────
-- A single trigger function that sets updated_at = NOW() on every UPDATE.
-- Applied to all tables that carry an updated_at column.

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- Apply to users
CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Apply to check_ins
CREATE TRIGGER trg_check_ins_updated_at
    BEFORE UPDATE ON check_ins
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Apply to subscriptions
CREATE TRIGGER trg_subscriptions_updated_at
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Apply to insight_metadata
CREATE TRIGGER trg_insight_metadata_updated_at
    BEFORE UPDATE ON insight_metadata
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Apply to user_notification_prefs
CREATE TRIGGER trg_notification_prefs_updated_at
    BEFORE UPDATE ON user_notification_prefs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TRIGGER IF EXISTS trg_notification_prefs_updated_at ON user_notification_prefs;
DROP TRIGGER IF EXISTS trg_insight_metadata_updated_at   ON insight_metadata;
DROP TRIGGER IF EXISTS trg_subscriptions_updated_at      ON subscriptions;
DROP TRIGGER IF EXISTS trg_check_ins_updated_at          ON check_ins;
DROP TRIGGER IF EXISTS trg_users_updated_at              ON users;
DROP FUNCTION IF EXISTS set_updated_at();
-- +goose StatementEnd