-- +goose Up
-- +goose StatementBegin

ALTER TABLE check_ins
    ADD COLUMN small_wins TEXT;

COMMENT ON COLUMN check_ins.small_wins IS 'User-reported recovery action that helped today (e.g. "walked outside", "slept early").';

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE check_ins
    DROP COLUMN IF EXISTS small_wins;
-- +goose StatementEnd