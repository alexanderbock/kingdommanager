import type { FastifyInstance } from 'fastify';
import { getDb } from '../db.js';
import { completeTurn, findActiveTurn, startTurn } from '../turn-service.js';
import { listTurnLog } from '../turn-log.js';

/**
 * Turn log: every change grouped by turn. Turn 0 (setup) is never logged.
 * "Next turn" finishes the active turn and starts the next one.
 */
export function registerTurnLogRoutes(app: FastifyInstance, apiPrefix: string): void {
  app.get(`${apiPrefix}/turn-log`, async () => listTurnLog());

  /** Remove one log entry: all audit rows it was merged from. */
  app.delete(`${apiPrefix}/turn-log`, async (req, reply) => {
    const ids = (req.body as any)?.ids;
    if (!Array.isArray(ids) || ids.length === 0 || !ids.every((n) => Number.isInteger(n))) {
      return reply.code(400).send({ error: 'ids must be a non-empty array of integers' });
    }
    const placeholders = ids.map(() => '?').join(', ');
    const ok = getDb()
      .prepare(`DELETE FROM audit_log WHERE id IN (${placeholders})`)
      .run(...ids).changes > 0;
    if (!ok) return reply.code(404).send({ error: 'not found' });
    return reply.code(204).send();
  });

  app.post(`${apiPrefix}/turn-log/next-turn`, async (req, reply) => {
    const inGameDate = String((req.body as any)?.inGameDate ?? '');
    const result = getDb().transaction(() => {
      const active = findActiveTurn();
      if (active) completeTurn(active);
      return startTurn(inGameDate);
    })();
    if (result.code !== 201) return reply.code(result.code).send({ error: result.error });
    return reply.code(201).send(result.rec);
  });
}