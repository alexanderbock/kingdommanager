-- 003: kingdom record gains the untrainedImprovisation house-rule toggle.
-- Backfill false on kingdom records created before this migration.
UPDATE kingdom
SET data = json_set(data, '$.untrainedImprovisation', json('false'))
WHERE json_extract(data, '$.untrainedImprovisation') IS NULL;