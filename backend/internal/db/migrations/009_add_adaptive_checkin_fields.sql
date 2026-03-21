-- +goose Up
-- +goose StatementBegin

ALTER TABLE check_ins
    ADD COLUMN energy_level      SMALLINT     CHECK (energy_level BETWEEN 1 AND 5),
    ADD COLUMN focus_quality     SMALLINT     CHECK (focus_quality BETWEEN 1 AND 5),
    ADD COLUMN hours_worked      NUMERIC(4,1) CHECK (hours_worked >= 0 AND hours_worked <= 24),
    ADD COLUMN physical_symptoms TEXT[];

COMMENT ON COLUMN check_ins.energy_level      IS 'Self-reported energy (1=depleted … 5=high). Only collected when stress >= 3.';
COMMENT ON COLUMN check_ins.focus_quality     IS 'Self-reported focus quality (1=scattered … 5=sharp). Only collected when stress >= 3.';
COMMENT ON COLUMN check_ins.hours_worked      IS 'Hours worked today, one decimal place. Only collected when stress >= 3.';
COMMENT ON COLUMN check_ins.physical_symptoms IS 'Array of reported symptoms. Valid values: headache, muscle_tension, fatigue, trouble_sleeping, appetite_changes. Only collected when stress >= 4. Element validation is enforced in the application layer (CheckinSignals validator), not in the schema.';

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE check_ins
    DROP COLUMN IF EXISTS energy_level,
    DROP COLUMN IF EXISTS focus_quality,
    DROP COLUMN IF EXISTS hours_worked,
    DROP COLUMN IF EXISTS physical_symptoms;
-- +goose StatementEnd
