import { getDb } from './db.js';

/** Number of the currently active turn, or 0 during setup (turn 0). */
export function activeTurnNumber(): number {
  const row = getDb()
    .prepare("SELECT number FROM turns WHERE json_extract(data, '$.status') = 'active' LIMIT 1")
    .get() as { number: number } | undefined;
  return row ? row.number : 0;
}

/**
 * The turn a write belongs to. Writes to a turn record itself belong to that
 * turn's own number — by the time a turn's completion is audited it is no
 * longer active, so the lookup would wrongly return 0.
 */
export function turnNumberFor(entity: string, data: unknown): number {
  if (
    entity === 'turns' &&
    data != null &&
    typeof data === 'object' &&
    typeof (data as any).number === 'number'
  ) {
    return (data as any).number;
  }
  return activeTurnNumber();
}

/** Append an audit row for every write. */
export function audit(
  entity: string,
  entityId: string | null,
  action: string,
  before: unknown,
  after: unknown,
  turnNumber: number,
): void {
  getDb()
    .prepare(
      `INSERT INTO audit_log (entity, entity_id, action, at, before_val, after_val, turn_number)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      entity,
      entityId,
      action,
      new Date().toISOString(),
      before == null ? null : JSON.stringify(before),
      after == null ? null : JSON.stringify(after),
      turnNumber,
    );
}
