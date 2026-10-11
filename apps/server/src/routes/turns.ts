import type { FastifyInstance } from 'fastify';
import { ActivitySelectionSchema } from '@kingdom/shared';
import { getDb } from '../db.js';
import * as store from '../store.js';
import { turnTemplate } from '../catalog.js';
import { completeTurn, findActiveTurn, startTurn } from '../turn-service.js';

const params = (req: any): Record<string, string> => req.params as Record<string, string>;

function findTurnByNumber(n: number) {
  return store.listAll('turns').find((t) => t.data.number === n) ?? null;
}

/**
 * Turn lifecycle: start (one step state per enabled template step), step state,
 * and completion. Log entries live in routes/log.ts; the change log in
 * routes/turn-log.ts.
 */
export function registerTurnRoutes(app: FastifyInstance, apiPrefix: string): void {
  app.get(`${apiPrefix}/turns`, async () => {
    return store.listAll('turns').sort((a, b) => b.data.number - a.data.number);
  });

  app.get(`${apiPrefix}/turns/active`, async (req, reply) => {
    const active = findActiveTurn();
    if (!active) return reply.code(404).send({ error: 'no active turn' });
    return active;
  });

  app.get(`${apiPrefix}/turns/:n`, async (req, reply) => {
    const turn = findTurnByNumber(Number(params(req).n));
    if (!turn) return reply.code(404).send({ error: 'not found' });
    const log = store
      .listAll('log_entries')
      .filter((l) => l.data.turnId === turn.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return { turn, log };
  });

  app.post(`${apiPrefix}/turns`, async (req, reply) => {
    const inGameDate = String((req.body as any)?.inGameDate ?? '');
    const result = getDb().transaction(() => startTurn(inGameDate))();
    if (result.code !== 201) return reply.code(result.code).send({ error: result.error });
    return reply.code(201).send(result.rec);
  });

  app.patch(`${apiPrefix}/turns/:n/steps/:stepKey`, async (req, reply) => {
    const turn = findTurnByNumber(Number(params(req).n));
    if (!turn) return reply.code(404).send({ error: 'not found' });
    if (turn.data.status !== 'active') {
      return reply.code(400).send({ error: 'turn is complete and read-only' });
    }
    const key = params(req).stepKey;
    const state = turn.data.stepState[key];
    if (!state) return reply.code(404).send({ error: 'unknown step' });
    const body = req.body as any;
    const next: any = { ...turn.data };
    const ns = { ...state };
    if (typeof body.done === 'boolean') ns.done = body.done;
    if (body.checklist && typeof body.checklist === 'object') {
      ns.checklist = { ...ns.checklist, ...body.checklist };
    }
    if (typeof body.notes === 'string') ns.notes = body.notes;
    if (body.activities !== undefined) {
      const parsed = ActivitySelectionSchema.array().safeParse(body.activities);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'validation', details: parsed.error.flatten() });
      }
      ns.activities = parsed.data;
    }
    if (typeof body.currentStepKey === 'string') next.currentStepKey = body.currentStepKey;
    next.stepState = { ...next.stepState, [key]: ns };
    const result = store.updateRecord(
      'turns',
      'turns',
      turn.id,
      next,
      body.version ?? turn.version,
      Boolean(body.force),
    );
    if (result.status === 'notfound') return reply.code(404).send({ error: 'not found' });
    if (result.status === 'conflict') {
      return reply.code(409).send({ error: 'conflict', current: result.current });
    }
    return result.record;
  });

  app.post(`${apiPrefix}/turns/:n/complete`, async (req, reply) => {
    const turn = findTurnByNumber(Number(params(req).n));
    if (!turn) return reply.code(404).send({ error: 'not found' });
    if (turn.data.status === 'complete') {
      return reply.code(400).send({ error: 'turn is already complete' });
    }
    const titles = new Map(turnTemplate().steps.map((s) => [s.key, s.title]));
    const notDone = Object.entries(turn.data.stepState as Record<string, { done: boolean }>)
      .filter(([, state]) => !state.done)
      .map(([key]) => titles.get(key) ?? key);
    if (notDone.length) {
      return reply.code(400).send({ error: 'steps not done', steps: notDone });
    }
    getDb().transaction(() => completeTurn(turn))();
    return findTurnByNumber(turn.data.number);
  });
}
