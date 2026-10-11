import type { FastifyInstance } from 'fastify';
import { getDb } from '../db.js';
import { seedIfEmpty, seedSettlementsIfEmpty } from '../seed.js';
import { broadcast } from '../sse.js';
import { TABLES } from './backup.js';

/** Application-wide settings endpoints. */
export function registerSettingsRoutes(app: FastifyInstance, apiPrefix: string): void {
  /** Wipe all data and re-seed: the app returns to its initial state. */
  app.post(`${apiPrefix}/reset`, async () => {
    getDb().transaction(() => {
      for (const t of TABLES) getDb().prepare(`DELETE FROM ${t}`).run();
      getDb().prepare("DELETE FROM meta WHERE key = 'seeded'").run();
    })();
    seedIfEmpty();
    seedSettlementsIfEmpty();
    broadcast({ entity: 'import', id: null, version: 0 });
    return { ok: true };
  });
}