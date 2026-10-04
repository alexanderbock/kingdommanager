import { getDb } from './db.js';
import { audit } from './audit.js';
import { broadcast } from './sse.js';
import type { StoredRecord } from '@kingdom/shared';

interface Row {
  id: string;
  version: number;
  created_at: string;
  updated_at: string;
  data: string;
}

function rowToRecord(row: Row): StoredRecord {
  return {
    id: row.id,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    data: JSON.parse(row.data),
  };
}

export function listAll(table: string): StoredRecord[] {
  const rows = getDb()
    .prepare(`SELECT * FROM ${table} ORDER BY created_at ASC, id ASC`)
    .all() as Row[];
  return rows.map(rowToRecord);
}

export function getById(table: string, id: string): StoredRecord | null {
  const row = getDb().prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) as Row | undefined;
  return row ? rowToRecord(row) : null;
}

export function createRecord(
  table: string,
  entity: string,
  id: string,
  data: unknown,
  extra: Record<string, unknown> = {},
): StoredRecord {
  const now = new Date().toISOString();
  const extraCols = Object.keys(extra);
  const cols = ['id', 'version', 'created_at', 'updated_at', 'data', ...extraCols].join(', ');
  const placeholders = ['?', '1', '?', '?', '?', ...extraCols.map(() => '?')].join(', ');
  getDb()
    .prepare(`INSERT INTO ${table} (${cols}) VALUES (${placeholders})`)
    .run(id, now, now, JSON.stringify(data), ...extraCols.map((k) => extra[k]));
  audit(entity, id, 'create', null, data);
  broadcast({ entity, id, version: 1 });
  return { id, version: 1, createdAt: now, updatedAt: now, data };
}

export type UpdateResult =
  | { status: 'ok'; record: StoredRecord }
  | { status: 'conflict'; current: StoredRecord }
  | { status: 'notfound' };

/**
 * Last-write-wins with version checks: a stale `expectedVersion` returns a
 * conflict carrying the current record; `force` overwrites it.
 */
export function updateRecord(
  table: string,
  entity: string,
  id: string,
  data: unknown,
  expectedVersion: number | null,
  force: boolean,
): UpdateResult {
  const current = getById(table, id);
  if (!current) return { status: 'notfound' };
  if (!force && expectedVersion != null && expectedVersion !== current.version) {
    return { status: 'conflict', current };
  }
  const now = new Date().toISOString();
  const version = current.version + 1;
  getDb()
    .prepare(`UPDATE ${table} SET data = ?, version = ?, updated_at = ? WHERE id = ?`)
    .run(JSON.stringify(data), version, now, id);
  audit(entity, id, 'update', current.data, data);
  broadcast({ entity, id, version });
  return { status: 'ok', record: { ...current, data, version, updatedAt: now } };
}

export function deleteRecord(table: string, entity: string, id: string): boolean {
  const current = getById(table, id);
  if (!current) return false;
  getDb().prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
  audit(entity, id, 'delete', current.data, null);
  broadcast({ entity, id, version: current.version + 1 });
  return true;
}
