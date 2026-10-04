import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { getDb } from '../db.js';
import * as store from '../store.js';

const params = (req: any): Record<string, string> => req.params as Record<string, string>;

function findTurnByNumber(n: number) {
  return store.listAll('turns').find((t) => t.data.number === n) ?? null;
}

/**
 * Turn lifecycle: start (snapshots the enabled template), step state,
 * and completion. Log entries live in routes/log.ts.
 */
export function registerTurnRoutes(app: FastifyInstance, apiPrefix: string): void {
  app.get(`${apiPrefix}/turns`, async () => {
    return store.listAll('turns').sort((a, b) => b.data.number - a.data.number);
  });

  app.get(`${apiPrefix}/turns/active`, async (req, reply) => {
    const active = store.listAll('turns').find((t) => t.data.status === 'active');
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
    const result = getDb().transaction(() => {
      const turns = store.listAll('turns');
      if (turns.some((t) => t.data.status === 'active')) {
        return { code: 409, error: 'an active turn already exists' };
      }
      const template = store.getById('turn_template', 'turn-template');
      if (!template) return { code: 400, error: 'turn template missing' };
      const number = turns.length ? Math.max(...turns.map((t) => t.data.number)) + 1 : 1;
      const steps = [...template.data.steps]
        .filter((s: any) => s.enabled)
        .sort((a: any, b: any) => a.order - b.order);
      const stepState: Record<string, any> = {};
      for (const s of steps) stepState[s.key] = { done: false, checklist: {}, notes: '' };
      const data = {
        number,
        inGameDate,
        status: 'active',
        currentStepKey: steps[0]?.key ?? null,
        startedAt: new Date().toISOString(),
        completedAt: null,
        template: { phases: template.data.phases, steps },
        stepState,
      };
      return { code: 201, rec: store.createRecord('turns', 'turns', randomUUID(), data, { number }) };
    })();
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
    const notDone = turn.data.template.steps
      .filter((s: any) => !turn.data.stepState[s.key]?.done)
      .map((s: any) => s.title);
    if (notDone.length) {
      return reply.code(400).send({ error: 'steps not done', steps: notDone });
    }
    getDb().transaction(() => {
      const next = { ...turn.data, status: 'complete', completedAt: new Date().toISOString() };
      store.updateRecord('turns', 'turns', turn.id, next, turn.version, true);
      // Reset per-turn civic flags on all settlements.
      for (const s of store.listAll('settlements')) {
        if (s.data.civicActivityUsedThisTurn) {
          store.updateRecord(
            'settlements',
            'settlements',
            s.id,
            { ...s.data, civicActivityUsedThisTurn: false },
            s.version,
            true,
          );
        }
      }
    })();
    return findTurnByNumber(turn.data.number);
  });
}
