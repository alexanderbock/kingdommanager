import { getDb } from './db.js';

/** Append an audit row for every write. */
export function audit(
  entity: string,
  entityId: string | null,
  action: string,
  before: unknown,
  after: unknown,
): void {
  getDb()
    .prepare(
      `INSERT INTO audit_log (entity, entity_id, action, at, before_val, after_val)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      entity,
      entityId,
      action,
      new Date().toISOString(),
      before == null ? null : JSON.stringify(before),
      after == null ? null : JSON.stringify(after),
    );
}
