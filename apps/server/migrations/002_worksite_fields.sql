-- 002: work sites gain free-text location and comments.
-- Backfill the fields on kingdom records created before this migration.
-- (The old gmNotes field is simply dropped on the next save; Zod strips it.)
UPDATE kingdom
SET data = json_set(data,
  '$.workSites.farmland.location', '',
  '$.workSites.farmland.comments', '',
  '$.workSites.lumber.location', '',
  '$.workSites.lumber.comments', '',
  '$.workSites.mine.location', '',
  '$.workSites.mine.comments', '',
  '$.workSites.quarry.location', '',
  '$.workSites.quarry.comments', ''
)
WHERE json_extract(data, '$.workSites.farmland.location') IS NULL;