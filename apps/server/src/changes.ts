/**
 * Pure helpers for the log endpoint's explicit change application.
 * The server performs exactly one user-specified addition or assignment per
 * change and records before/after. Nothing else is ever derived.
 */

export interface ResolvedTarget {
  table: string;
  entity: string;
  id: string | null;
  path: string[];
}

const ENTITY_TARGETS: Record<string, { table: string; entity: string; needsId: boolean }> = {
  kingdom: { table: 'kingdom', entity: 'kingdom', needsId: false },
  settlements: { table: 'settlements', entity: 'settlements', needsId: true },
  armies: { table: 'armies', entity: 'armies', needsId: true },
  hexes: { table: 'hexes', entity: 'hexes', needsId: true },
  factions: { table: 'factions', entity: 'factions', needsId: true },
  events: { table: 'kingdom_events', entity: 'events', needsId: true },
  milestones: { table: 'milestones', entity: 'milestones', needsId: true },
};

/**
 * Resolve a change target like "kingdom.resourcePoints" or
 * "settlements.<id>.influence" to a table, record id and field path.
 */
export function resolveTarget(target: string): ResolvedTarget | null {
  const parts = target.split('.');
  const def = ENTITY_TARGETS[parts[0]];
  if (!def) return null;
  if (def.needsId) {
    if (parts.length < 3) return null;
    return { table: def.table, entity: def.entity, id: parts[1], path: parts.slice(2) };
  }
  if (parts.length < 2) return null;
  return { table: def.table, entity: def.entity, id: null, path: parts.slice(1) };
}

/**
 * Apply one change to a record's data object (mutates it) and return
 * before/after. `delta` treats a null before-value as 0.
 */
export function applyChangeToData(
  data: any,
  path: string[],
  mode: 'delta' | 'set',
  value: number,
): { before: unknown; after: unknown } {
  if (!path.length) throw new Error('empty change path');
  const last = path[path.length - 1];
  const parent =
    path.length === 1 ? data : path.slice(0, -1).reduce((o: any, k) => o?.[k], data);
  if (parent == null || typeof parent !== 'object') {
    throw new Error(`change path not found: ${path.join('.')}`);
  }
  if (!(last in parent)) throw new Error(`field does not exist: ${path.join('.')}`);
  const before = parent[last] ?? null;
  const after = mode === 'set' ? value : typeof before === 'number' ? before + value : value;
  parent[last] = after;
  return { before, after };
}
