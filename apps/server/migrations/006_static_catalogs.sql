-- 006: rules content (activities, reference tables, structure catalog, turn
-- template) is read from seed/*.json at runtime and no longer stored.
-- Skills, leaders and milestones keep their tables but store only the
-- user-entered state (SCHEMA_VERSION 2: older databases must be deleted).
DROP TABLE IF EXISTS activities;
DROP TABLE IF EXISTS reference_tables;
DROP TABLE IF EXISTS structure_defs;
DROP TABLE IF EXISTS turn_template;
