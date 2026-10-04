import type { FastifyInstance } from 'fastify';
import { KingdomSchema } from '@kingdom/shared';
import * as store from '../store.js';

const ID = 'kingdom';

/** Singleton kingdom record: GET and PATCH only. */
export function registerKingdomRoutes(app: FastifyInstance, apiPrefix: string): void {
  app.get(`${apiPrefix}/kingdom`, async (req, reply) => {
    const rec = store.getById('kingdom', ID);
    if (!rec) return reply.code(404).send({ error: 'not found' });
    return rec;
  });

  app.patch(`${apiPrefix}/kingdom`, async (req, reply) => {
    const body = req.body as any;
    const parsed = KingdomSchema.safeParse(body?.data ?? body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'validation', details: parsed.error.flatten() });
    }
    const result = store.updateRecord(
      'kingdom',
      'kingdom',
      ID,
      parsed.data,
      body.version ?? null,
      Boolean(body.force),
    );
    if (result.status === 'notfound') return reply.code(404).send({ error: 'not found' });
    if (result.status === 'conflict') {
      return reply.code(409).send({ error: 'conflict', current: result.current });
    }
    return result.record;
  });
}
