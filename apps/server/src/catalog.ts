import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  Activity,
  KingdomSkillDef,
  MilestoneDef,
  ReferenceTable,
  StructureDef,
  TurnTemplate,
} from '@kingdom/shared';

/**
 * Static rules content lives in seed/*.json and is read on every call, so the
 * GM can edit a file and see the change after a page refresh (no restart, no
 * re-seed). Only user-entered values are stored in the database.
 */
function findSeedDir(): string {
  // Walk up from this module (src or dist) to the server root, so this works
  // both in dev (tsx from src) and production (dist).
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 4; i++) {
    const candidate = path.join(dir, 'seed');
    if (existsSync(path.join(candidate, 'activities.json'))) return candidate;
    dir = path.dirname(dir);
  }
  throw new Error('seed directory not found');
}

export function readCatalog<T>(file: string): T {
  return JSON.parse(readFileSync(path.join(findSeedDir(), file), 'utf8')) as T;
}

export const activities = () => readCatalog<Activity[]>('activities.json');
export const referenceTables = () => readCatalog<ReferenceTable[]>('reference.json');
export const structureDefs = () => readCatalog<StructureDef[]>('structures.json');
export const turnTemplate = () => readCatalog<TurnTemplate>('turn-template.json');
export const milestoneDefs = () => readCatalog<MilestoneDef[]>('milestones.json');
export const skillDefs = () => readCatalog<KingdomSkillDef[]>('skills.json');
