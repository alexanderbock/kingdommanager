import { getDb } from './db.js';
import * as store from './store.js';
import { catalogStateByEntity } from './catalog-state.js';
import type { TurnLogChange, TurnLogEntry, TurnLogResponse, TurnLogTurn } from '@kingdom/shared';

interface AuditRow {
  id: number;
  entity: string;
  entity_id: string | null;
  action: string;
  at: string;
  before_val: string | null;
  after_val: string | null;
  turn_number: number;
}

function parseJson(value: string | null): any {
  if (value == null) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/** Human-readable name for a record of the given entity. */
export function labelFor(entity: string, data: any, id: string | null = null): string {
  // Catalog-backed records store only their state; the name is in the catalog.
  const catalog = catalogStateByEntity(entity);
  if (catalog && id != null) return catalog.label(catalog.defs().get(id), id);
  const name =
    data != null && typeof data === 'object' && typeof data.name === 'string' && data.name
      ? data.name
      : null;
  switch (entity) {
    case 'kingdom':
      return name ? `Kingdom "${name}"` : 'Kingdom';
    case 'settlements':
      return name ? `Settlement "${name}"` : 'Settlement';
    case 'armies':
      return name ? `Army "${name}"` : 'Army';
    case 'events':
      return name ? `Event "${name}"` : 'Event';
    case 'factions':
      return name ? `Faction "${name}"` : 'Faction';
    case 'milestones':
      return name ? `Milestone "${name}"` : 'Milestone';
    case 'structures':
      return data?.customName ? `Structure "${data.customName}"` : 'Structure';
    case 'hexes':
      return data?.coord ? `Hex ${data.coord}` : 'Hex';
    case 'skills':
      return data?.name ? `Skill: ${data.name}` : 'Skill';
    case 'leaders':
      return data?.role ? `Leader: ${data.role}` : 'Leader';
    case 'feats':
      return name ? `Feat "${name}"` : 'Feat';
    case 'modifiers':
      return name ? `Modifier "${name}"` : 'Modifier';
    case 'turns':
      return typeof data?.number === 'number' ? `Turn ${data.number}` : 'Turn';
    case 'log':
      return 'Log entry';
    default:
      return entity;
  }
}

/**
 * Recursively diff two data objects into changed leaf fields with dot paths.
 * Arrays and shape changes count as one changed field.
 */
export function diffData(before: any, after: any, path: string[] = []): TurnLogChange[] {
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  const bothObjects =
    before != null &&
    after != null &&
    typeof before === 'object' &&
    typeof after === 'object' &&
    !Array.isArray(before) &&
    !Array.isArray(after);
  if (!bothObjects) return [{ field: path.join('.'), before, after }];
  const out: TurnLogChange[] = [];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) out.push(...diffData(before[key], after[key], [...path, key]));
  return out;
}

/** Whether a single audit row changed the given field. */
function rowTouches(row: AuditRow, field: string): boolean {
  return diffData(parseJson(row.before_val), parseJson(row.after_val)).some((c) => c.field === field);
}

/**
 * All changes grouped by turn (newest first). Turn 0 (setup, before the
 * first turn) is excluded, as is the turn lifecycle itself. Writes to the
 * same record within a turn are coalesced to its final state: a record
 * created in the turn is one "created with values" entry (final data), a
 * record deleted in the turn is one "deleted" entry, and each net-changed
 * field of an existing record is its own entry (first before -> last
 * after). Groups with no net change are dropped. The active turn is
 * included even when empty.
 */
export function listTurnLog(): TurnLogResponse {
  const turns = store.listAll('turns');
  const active = turns.find((t) => t.data.status === 'active') ?? null;
  const rows = getDb()
    .prepare('SELECT * FROM audit_log WHERE turn_number > 0 ORDER BY turn_number ASC, id ASC')
    .all() as AuditRow[];

  // Group writes per turn and per record, in row order.
  const byTurn = new Map<number, TurnLogEntry[]>();
  const groups = new Map<number, Map<string, AuditRow[]>>();
  for (const row of rows) {
    if (row.entity === 'turns') continue; // turn lifecycle is not a game change
    const turnGroups = groups.get(row.turn_number) ?? new Map<string, AuditRow[]>();
    const key = `${row.entity}:${row.entity_id ?? ''}`;
    const group = turnGroups.get(key) ?? [];
    group.push(row);
    turnGroups.set(key, group);
    groups.set(row.turn_number, turnGroups);
  }

  for (const [turnNumber, turnGroups] of groups) {
    const built: { entry: TurnLogEntry; order: number }[] = [];
    for (const group of turnGroups.values()) {
      const first = group[0];
      const last = group[group.length - 1];
      const before = parseJson(first.before_val);
      const after = parseJson(last.after_val);
      const ids = group.map((r) => r.id);
      const base = { entity: first.entity, entityId: first.entity_id };

      // No net change: created and deleted again within the turn.
      if (first.action === 'create' && last.action === 'delete') continue;
      if (last.action === 'delete') {
        built.push({
          order: first.id,
          entry: {
            ...base,
            ids,
            action: 'delete',
            at: last.at,
            label: labelFor(first.entity, before, first.entity_id),
            changes: [],
          },
        });
        continue;
      }
      if (first.action === 'create') {
        built.push({
          order: first.id,
          entry: {
            ...base,
            ids,
            action: 'create',
            at: last.at,
            label: labelFor(first.entity, after, first.entity_id),
            changes: [],
            values: after,
          },
        });
        continue;
      }
      // Existing record: one entry per net-changed field, in the order the
      // field was first touched.
      const net = diffData(before, after);
      if (net.length === 0) continue; // changed and reverted
      for (const change of net) {
        let firstTouch = first;
        let lastTouch = last;
        for (const r of group) {
          if (rowTouches(r, change.field)) {
            firstTouch = r;
            break;
          }
        }
        for (let i = group.length - 1; i >= 0; i--) {
          if (rowTouches(group[i], change.field)) {
            lastTouch = group[i];
            break;
          }
        }
        // The name is shown in the diff itself, so keep the label plain.
        const labelData = change.field === 'name' ? { ...after, name: undefined } : after;
        built.push({
          order: firstTouch.id,
          entry: {
            ...base,
            ids,
            action: 'update',
            at: lastTouch.at,
            label: labelFor(first.entity, labelData, first.entity_id),
            changes: [change],
          },
        });
      }
    }
    built.sort((a, b) => a.order - b.order);
    byTurn.set(turnNumber, built.map((b) => b.entry));
  }

  const turnList: TurnLogTurn[] = turns
    .filter((t) => t.data.status === 'active' || (byTurn.get(t.data.number)?.length ?? 0) > 0)
    .map((t) => ({
      number: t.data.number,
      inGameDate: t.data.inGameDate,
      status: t.data.status,
      startedAt: t.data.startedAt,
      completedAt: t.data.completedAt,
      entries: byTurn.get(t.data.number) ?? [],
    }))
    .sort((a, b) => b.number - a.number);
  return { activeTurnNumber: active ? active.data.number : null, turns: turnList };
}