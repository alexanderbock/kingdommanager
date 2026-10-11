-- 005: turn log. Stamp every audit row with the active turn number at write
-- time so changes can be grouped per turn. 0 = setup (before the first
-- turn); those rows are kept for the audit trail but not shown in the log.
ALTER TABLE audit_log ADD COLUMN turn_number INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_audit_log_turn ON audit_log (turn_number);