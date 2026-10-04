import type { FastifyInstance } from 'fastify';
import { getDb } from '../db.js';
import * as store from '../store.js';
import { broadcast } from '../sse.js';

const TABLES = [
  'kingdom',
  'kingdom_skills',
  'leaders',
  'feats',
  'modifiers',
  'settlements',
  'structure_defs',
  'structure_instances',
  'armies',
  'kingdom_events',
  'hexes',
  'factions',
  'milestones',
  'turn_template',
  'activities',
  'reference_tables',
  'turns',
  'log_entries',
];

/** Full database backup as one JSON document. */
export function registerBackupRoutes(app: FastifyInstance, apiPrefix: string): void {
  app.get(`${apiPrefix}/export`, async () => {
    const data: Record<string, unknown[]> = {};
    for (const t of TABLES) data[t] = store.listAll(t);
    return { app: 'kingdom-manager', version: 1, exportedAt: new Date().toISOString(), data };
  });

  /** Restore a backup (GM mode, confirm in the UI). Wipes and re-inserts all tables. */
  app.post(`${apiPrefix}/import`, async (req, reply) => {
    const body = req.body as any;
    if (!body || body.app !== 'kingdom-manager' || !body.data || typeof body.data !== 'object') {
      return reply.code(400).send({ error: 'invalid backup document' });
    }
    getDb().transaction(() => {
      for (const t of TABLES) getDb().prepare(`DELETE FROM ${t}`).run();
      for (const t of TABLES) {
        const rows = body.data[t] ?? [];
        const ins = getDb().prepare(
          `INSERT INTO ${t} (id, version, created_at, updated_at, data) VALUES (?, ?, ?, ?, ?)`,
        );
        const insTurn = getDb().prepare(
          `INSERT INTO turns (id, number, version, created_at, updated_at, data) VALUES (?, ?, ?, ?, ?, ?)`,
        );
        const insLog = getDb().prepare(
          `INSERT INTO log_entries (id, turn_id, version, created_at, updated_at, data) VALUES (?, ?, ?, ?, ?, ?)`,
        );
        for (const r of rows) {
          if (t === 'turns') {
            insTurn.run(r.id, r.data.number, r.version, r.createdAt, r.updatedAt, JSON.stringify(r.data));
          } else if (t === 'log_entries') {
            insLog.run(r.id, r.data.turnId, r.version, r.createdAt, r.updatedAt, JSON.stringify(r.data));
          } else {
            ins.run(r.id, r.version, r.createdAt, r.updatedAt, JSON.stringify(r.data));
          }
        }
      }
    })();
    broadcast({ entity: 'import', id: null, version: 0 });
    return { ok: true };
  });
}
