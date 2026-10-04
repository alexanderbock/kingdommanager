import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import {
  LogEntrySchema,
  ChangeSpecSchema,
  type LogEntry,
  type LogChange,
} from '@kingdom/shared';
import { getDb } from '../db.js';
import * as store from '../store.js';
import { resolveTarget, applyChangeToData } from '../changes.js';

const params = (req: any): Record<string, string> => req.params as Record<string, string>;

function findTurnByNumber(n: number) {
  return store.listAll('turns').find((t) => t.data.number === n) ?? null;
}

function parseLogInput(body: any): { data?: any; changes?: any[]; error?: any } {
  const parsed = LogEntrySchema.omit({ changes: true, reverted: true }).safeParse(body);
  if (!parsed.success) return { error: parsed.error.flatten() };
  let changes: any[] = [];
  if (body.changes) {
    const c = ChangeSpecSchema.array().safeParse(body.changes);
    if (!c.success) return { error: c.error.flatten() };
    changes = c.data;
  }
  return { data: parsed.data, changes };
}

/**
 * Log entries. POST applies the explicit user-typed changes (delta/set) in the
 * same transaction as the insert; this is the only place the server touches
 * game numbers.
 */
export function registerLogRoutes(app: FastifyInstance, apiPrefix: string): void {
  app.post(`${apiPrefix}/turns/:n/log`, async (req, reply) => {
    const turn = findTurnByNumber(Number(params(req).n));
    if (!turn) return reply.code(404).send({ error: 'not found' });
    if (turn.data.status !== 'active') {
      return reply.code(400).send({ error: 'turn is complete and read-only' });
    }
    const p = parseLogInput(req.body);
    if (p.error) return reply.code(400).send({ error: 'validation', details: p.error });
    const input = p.data;
    const result = getDb().transaction(() => {
      const applied: LogChange[] = [];
      for (const spec of p.changes ?? []) {
        const resolved = resolveTarget(spec.target);
        if (!resolved) return { code: 400, error: `unknown change target: ${spec.target}` };
        const rec = resolved.id
          ? store.getById(resolved.table, resolved.id)
          : store.getById(resolved.table, 'kingdom');
        if (!rec) return { code: 400, error: `change target not found: ${spec.target}` };
        let before: unknown;
        let after: unknown;
        try {
          ({ before, after } = applyChangeToData(rec.data, resolved.path, spec.mode, spec.value));
        } catch (e: any) {
          return { code: 400, error: e.message };
        }
        store.updateRecord(resolved.table, resolved.entity, rec.id, rec.data, rec.version, true);
        applied.push({
          target: spec.target,
          mode: spec.mode,
          value: spec.value,
          field: resolved.path.join('.'),
          before,
          after,
        });
      }
      const data: LogEntry = { ...input, changes: applied, reverted: false };
      return {
        code: 201,
        rec: store.createRecord('log_entries', 'log', randomUUID(), data, { turn_id: input.turnId }),
      };
    })();
    if (result.code !== 201) return reply.code(result.code).send({ error: result.error });
    return reply.code(201).send(result.rec);
  });

  app.get(`${apiPrefix}/log/:id`, async (req, reply) => {
    const rec = store.getById('log_entries', params(req).id);
    if (!rec) return reply.code(404).send({ error: 'not found' });
    return rec;
  });

  app.patch(`${apiPrefix}/log/:id`, async (req, reply) => {
    const rec = store.getById('log_entries', params(req).id);
    if (!rec) return reply.code(404).send({ error: 'not found' });
    const body = req.body as any;
    const parsed = LogEntrySchema.omit({ changes: true, reverted: true }).safeParse({
      ...rec.data,
      ...body.data,
    });
    if (!parsed.success) {
      return reply.code(400).send({ error: 'validation', details: parsed.error.flatten() });
    }
    const next = { ...rec.data, ...parsed.data };
    const result = store.updateRecord(
      'log_entries',
      'log',
      rec.id,
      next,
      body.version ?? rec.version,
      Boolean(body.force),
    );
    if (result.status === 'conflict') {
      return reply.code(409).send({ error: 'conflict', current: result.current });
    }
    if (result.status === 'notfound') return reply.code(404).send({ error: 'not found' });
    return result.record;
  });

  app.delete(`${apiPrefix}/log/:id`, async (req, reply) => {
    const ok = store.deleteRecord('log_entries', 'log', params(req).id);
    if (!ok) return reply.code(404).send({ error: 'not found' });
    return reply.code(204).send();
  });

  /** Manual revert: applies the inverse of each change, marks the entry reverted. */
  app.post(`${apiPrefix}/log/:id/revert`, async (req, reply) => {
    const entry = store.getById('log_entries', params(req).id);
    if (!entry) return reply.code(404).send({ error: 'not found' });
    if (entry.data.reverted) return reply.code(400).send({ error: 'already reverted' });
    const turn = store.listAll('turns').find((t) => t.id === entry.data.turnId);
    if (turn && turn.data.status !== 'active') {
      return reply.code(400).send({ error: 'cannot revert changes in a completed turn' });
    }
    const result = getDb().transaction(() => {
      for (const change of [...entry.data.changes].reverse()) {
        const resolved = resolveTarget(change.target);
        if (!resolved) return { code: 400, error: `unknown change target: ${change.target}` };
        const rec = resolved.id
          ? store.getById(resolved.table, resolved.id)
          : store.getById(resolved.table, 'kingdom');
        if (!rec) return { code: 400, error: `change target not found: ${change.target}` };
        const inverse =
          change.mode === 'delta'
            ? { mode: 'delta' as const, value: -change.value }
            : { mode: 'set' as const, value: (change.before ?? null) as number };
        try {
          applyChangeToData(rec.data, resolved.path, inverse.mode, inverse.value);
        } catch (e: any) {
          return { code: 400, error: e.message };
        }
        store.updateRecord(resolved.table, resolved.entity, rec.id, rec.data, rec.version, true);
      }
      const next = { ...entry.data, reverted: true };
      const updated = store.updateRecord('log_entries', 'log', entry.id, next, entry.version, true);
      if (updated.status !== 'ok') return { code: 500, error: 'failed to mark entry reverted' };
      return { code: 200, rec: updated.record };
    })();
    if (result.code !== 200) return reply.code(result.code).send({ error: result.error });
    return result.rec;
  });
}
