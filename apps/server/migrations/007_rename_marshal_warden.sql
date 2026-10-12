-- 007: the "marshal" leader role is called "warden".
UPDATE leaders SET id = 'warden' WHERE id = 'marshal';
UPDATE audit_log SET entity_id = 'warden' WHERE entity = 'leaders' AND entity_id = 'marshal';
