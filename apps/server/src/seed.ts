import { getDb } from './db.js';
import { createRecord, getById } from './store.js';
import type { Kingdom } from '@kingdom/shared';

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

/**
 * Create the kingdom singleton on first run. Rules content (skills,
 * milestones, activities, ...) is not copied into the database: it is read
 * from seed/*.json at runtime, and only user-entered values are stored.
 */
export function seedIfEmpty(): void {
  const db = getDb();
  const seeded = db.prepare("SELECT value FROM meta WHERE key = 'seeded'").get();
  if (seeded) return;

  db.transaction(() => {
    if (!getById('kingdom', 'kingdom')) {
      createRecord('kingdom', 'kingdom', 'kingdom', defaultKingdom());
    }
    db.prepare("INSERT INTO meta (key, value) VALUES ('seeded', '1')").run();
  })();
}
