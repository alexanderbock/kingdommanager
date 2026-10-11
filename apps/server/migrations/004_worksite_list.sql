-- 004: work sites change from one entry per type (with a count) to a list of
-- individual sites, each with its own type, resource hexes, location, comments.
-- Convert pre-existing per-type objects into a 4-item list (one per type).
UPDATE kingdom
SET data = json_set(data, '$.workSites', json_array(
  json_object('id', 'farmland-1', 'type', 'farmland',
    'resourceHexes', json_extract(data, '$.workSites.farmland.resourceHexes'),
    'location', coalesce(json_extract(data, '$.workSites.farmland.location'), ''),
    'comments', coalesce(json_extract(data, '$.workSites.farmland.comments'), '')),
  json_object('id', 'lumber-1', 'type', 'lumber',
    'resourceHexes', json_extract(data, '$.workSites.lumber.resourceHexes'),
    'location', coalesce(json_extract(data, '$.workSites.lumber.location'), ''),
    'comments', coalesce(json_extract(data, '$.workSites.lumber.comments'), '')),
  json_object('id', 'mine-1', 'type', 'mine',
    'resourceHexes', json_extract(data, '$.workSites.mine.resourceHexes'),
    'location', coalesce(json_extract(data, '$.workSites.mine.location'), ''),
    'comments', coalesce(json_extract(data, '$.workSites.mine.comments'), '')),
  json_object('id', 'quarry-1', 'type', 'quarry',
    'resourceHexes', json_extract(data, '$.workSites.quarry.resourceHexes'),
    'location', coalesce(json_extract(data, '$.workSites.quarry.location'), ''),
    'comments', coalesce(json_extract(data, '$.workSites.quarry.comments'), ''))
))
WHERE json_type(data, '$.workSites') = 'object';