import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb } from './db.js';
import { createRecord, getById, listAll } from './store.js';
import type { Kingdom, Settlement } from '@kingdom/shared';

function defaultKingdom(): Kingdom {
  const zero = { score: null, modifier: null };
  const ruin = { value: null, threshold: null, penalty: null };
  const commodity = { stored: null, capacity: null };
  return {
    name: '',
    charter: '',
    heartland: '',
    government: '',
    level: null,
    xp: null,
    size: null,
    controlDc: null,
    unrest: null,
    fame: null,
    resourcePoints: null,
    resourceDice: { count: null, die: 'd10' },
    consumption: null,
    abilities: { culture: zero, economy: zero, loyalty: zero, stability: zero },
    ruin: { corruption: ruin, crime: ruin, decay: ruin, strife: ruin },
    commodities: {
      food: commodity,
      lumber: commodity,
      luxuries: commodity,
      ore: commodity,
      stone: commodity,
    },
    workSites: [
      { id: 'farmland-1', type: 'farmland', resourceHexes: null, location: '', comments: '' },
      { id: 'lumber-1', type: 'lumber', resourceHexes: null, location: '', comments: '' },
      { id: 'mine-1', type: 'mine', resourceHexes: null, location: '', comments: '' },
      { id: 'quarry-1', type: 'quarry', resourceHexes: null, location: '', comments: '' },
    ],
    untrainedImprovisation: false,
    notes: '',
  };
}

function readSeed(file: string): any {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'seed');
  return JSON.parse(readFileSync(path.join(dir, file), 'utf8'));
}

/** Load seed JSON into the database on first run. */
export function seedIfEmpty(): void {
  const db = getDb();
  const seeded = db.prepare("SELECT value FROM meta WHERE key = 'seeded'").get();
  if (seeded) return;

  db.transaction(() => {
    if (!getById('kingdom', 'kingdom')) {
      createRecord('kingdom', 'kingdom', 'kingdom', defaultKingdom());
    }
    for (const skill of readSeed('skills.json')) {
      createRecord('kingdom_skills', 'skills', skill.key, skill);
    }
    for (const leader of readSeed('leaders.json')) {
      createRecord('leaders', 'leaders', leader.role, leader);
    }
    createRecord('turn_template', 'turn-template', 'turn-template', readSeed('turn-template.json'));
    for (const activity of readSeed('activities.json')) {
      createRecord('activities', 'activities', activity.key, activity);
    }
    for (const table of readSeed('reference.json')) {
      createRecord('reference_tables', 'reference', table.key, table);
    }
    for (const milestone of readSeed('milestones.json')) {
      createRecord('milestones', 'milestones', milestone.name, milestone);
    }
    for (const def of readSeed('structures.json')) {
      createRecord('structure_defs', 'structure-defs', def.name, def);
    }
    db.prepare("INSERT INTO meta (key, value) VALUES ('seeded', '1')").run();
  })();
}

/** Every database gets a starting village (also runs on already-seeded DBs). */
export function seedSettlementsIfEmpty(): void {
  if (listAll('settlements').length > 0) return;
  const settlement: Settlement = {
    name: 'New Halvong',
    type: 'village',
    grids: 1,
    location: '',
    buildings: [],
  };
  createRecord('settlements', 'settlements', randomUUID(), settlement);
}
