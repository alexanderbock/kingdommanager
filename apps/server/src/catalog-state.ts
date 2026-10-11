import type { ZodTypeAny } from 'zod';
import {
  KingdomSkillSchema,
  KingdomSkillStateSchema,
  LeaderRole,
  LeaderSchema,
  LeaderStateSchema,
  MilestoneSchema,
  MilestoneStateSchema,
  type StoredRecord,
} from '@kingdom/shared';
import { milestoneDefs, skillDefs } from './catalog.js';
import * as store from './store.js';

/**
 * Entities whose definitions are static (seed JSON or code) and whose
 * user-entered values are stored in the database, one row per catalog id.
 * The API serves the merged record; only the state part is persisted.
 */
export interface CatalogStateDef {
  table: string;
  entity: string;
  /** Static part of every entry, keyed by record id. */
  defs: () => Map<string, Record<string, unknown>>;
  /** Merged shape the API accepts and returns. */
  fullSchema: ZodTypeAny;
  /** Stored shape (strips the static fields). */
  stateSchema: ZodTypeAny;
  defaultState: () => Record<string, unknown>;
  /** Display name for the turn log. */
  label: (def: Record<string, unknown> | undefined, id: string) => string;
}

const byKey = <T extends { key: string }>(list: T[]) => new Map(list.map((d) => [d.key, { ...d }]));

export const CATALOG_STATES: CatalogStateDef[] = [
  {
    table: 'kingdom_skills',
    entity: 'skills',
    defs: () => byKey(skillDefs()),
    fullSchema: KingdomSkillSchema,
    stateSchema: KingdomSkillStateSchema,
    defaultState: () => ({ proficiency: 'untrained', total: null, breakdown: '', notes: '' }),
    label: (def, id) => `Skill: ${def?.name ?? id}`,
  },
  {
    table: 'leaders',
    entity: 'leaders',
    defs: () => new Map(LeaderRole.options.map((role) => [role, { role }])),
    fullSchema: LeaderSchema,
    stateSchema: LeaderStateSchema,
    defaultState: () => ({
      holderName: '',
      isPC: false,
      invested: false,
      vacant: true,
      activitiesPerTurn: null,
      notes: '',
    }),
    label: (_def, id) => `Leader: ${id}`,
  },
  {
    table: 'milestones',
    entity: 'milestones',
    defs: () => byKey(milestoneDefs()),
    fullSchema: MilestoneSchema,
    stateSchema: MilestoneStateSchema,
    defaultState: () => ({ achieved: false, achievedOnTurn: null }),
    label: (def, id) => `Milestone "${def?.name ?? id}"`,
  },
];

export const catalogStateByTable = (table: string) => CATALOG_STATES.find((c) => c.table === table);
export const catalogStateByEntity = (entity: string) => CATALOG_STATES.find((c) => c.entity === entity);

/** Merge a catalog entry with its stored state (defaults and version 0 if never saved). */
export function mergedRecord(
  def: CatalogStateDef,
  id: string,
  staticData: Record<string, unknown>,
): StoredRecord {
  const row = store.getById(def.table, id);
  return {
    id,
    version: row?.version ?? 0,
    createdAt: row?.createdAt ?? '',
    updatedAt: row?.updatedAt ?? '',
    // Static fields win, so stored data can never override rules content.
    data: { ...def.defaultState(), ...(row?.data ?? {}), ...staticData },
  };
}

/**
 * Make sure a catalog entry has a state row (silently inserting the defaults),
 * so it can be updated like any other record. Returns false for tables that
 * are not catalog-backed or ids that are not in the catalog.
 */
export function ensureStateRow(table: string, id: string): boolean {
  const def = catalogStateByTable(table);
  if (!def || !def.defs().has(id)) return false;
  if (!store.getById(table, id)) store.insertSilently(table, id, def.defaultState());
  return true;
}
