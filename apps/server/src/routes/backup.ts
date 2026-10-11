import type { FastifyInstance } from 'fastify';
import { getDb } from '../db.js';
import * as store from '../store.js';
import { broadcast } from '../sse.js';

/** Every data table in the database (meta/schema_migrations excluded). */
export const TABLES = [
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
  'audit_log',
];

/** Full database backup as one JSON document. */
export function registerBackupRoutes(app: FastifyInstance, apiPrefix: string): void {
  app.get(`${apiPrefix}/export`, async () => {
    const data: Record<string, unknown[]> = {};
    for (const t of TABLES) {
      // audit_log rows are not StoredRecords; export them raw.
      data[t] = t === 'audit_log' ? getDb().prepare('SELECT * FROM audit_log ORDER BY id ASC').all() : store.listAll(t);
    }
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
      const insTurn = getDb().prepare(
        `INSERT INTO turns (id, number, version, created_at, updated_at, data) VALUES (?, ?, ?, ?, ?, ?)`,
      );
      const insLog = getDb().prepare(
        `INSERT INTO log_entries (id, turn_id, version, created_at, updated_at, data) VALUES (?, ?, ?, ?, ?, ?)`,
      );
      const insAudit = getDb().prepare(
        `INSERT INTO audit_log (id, entity, entity_id, action, at, before_val, after_val, turn_number)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const t of TABLES) {
        const rows = body.data[t] ?? [];
        if (t === 'turns') {
          for (const r of rows) {
            insTurn.run(r.id, r.data.number, r.version, r.createdAt, r.updatedAt, JSON.stringify(r.data));
          }
        } else if (t === 'log_entries') {
          for (const r of rows) {
            insLog.run(r.id, r.data.turnId, r.version, r.createdAt, r.updatedAt, JSON.stringify(r.data));
          }
        } else if (t === 'audit_log') {
          for (const r of rows) {
            insAudit.run(r.id, r.entity, r.entity_id, r.action, r.at, r.before_val, r.after_val, r.turn_number);
          }
        } else {
          const ins = getDb().prepare(
            `INSERT INTO ${t} (id, version, created_at, updated_at, data) VALUES (?, ?, ?, ?, ?)`,
          );
          for (const r of rows) {
            ins.run(r.id, r.version, r.createdAt, r.updatedAt, JSON.stringify(r.data));
          }
        }
      }
    })();
    broadcast({ entity: 'import', id: null, version: 0 });
    return { ok: true };
  });
}
