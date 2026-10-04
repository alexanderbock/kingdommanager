import type { FastifyInstance } from 'fastify';
import type { ZodTypeAny } from 'zod';
import { randomUUID } from 'node:crypto';
import * as store from '../store.js';

export interface CrudOptions {
  /** SQL table name (internal constant, never user input). */
  table: string;
  /** Entity name used in URLs and SSE broadcasts. */
  entity: string;
  /** Zod schema for the record's data payload. */
  schema: ZodTypeAny;
  /** If set, records are addressed by this data field (e.g. "key", "role") instead of a UUID. */
  keyField?: string;
}

/** Standard list/create/read/update/delete routes with Zod validation,
 *  version checks, audit rows and SSE broadcasts. */
export function registerCrud(app: FastifyInstance, apiPrefix: string, opts: CrudOptions): void {
  const base = `${apiPrefix}/${opts.entity}`;

  const parse = (body: any) => {
    const parsed = opts.schema.safeParse(body?.data ?? body);
    if (!parsed.success) return { error: parsed.error.flatten() as any };
    return { data: parsed.data as any };
  };

  app.get(base, async () => store.listAll(opts.table));

  app.post(base, async (req, reply) => {
    const p = parse(req.body);
    if (p.error) return reply.code(400).send({ error: 'validation', details: p.error });
    const data = p.data;
    const id = opts.keyField ? String(data[opts.keyField]) : randomUUID();
    if (store.getById(opts.table, id)) {
      return reply.code(409).send({ error: 'exists', current: store.getById(opts.table, id) });
    }
    return reply.code(201).send(store.createRecord(opts.table, opts.entity, id, data));
  });

  app.get(`${base}/:id`, async (req, reply) => {
    const { id } = req.params as { id: string };
    const rec = store.getById(opts.table, id);
    if (!rec) return reply.code(404).send({ error: 'not found' });
    return rec;
  });

  app.patch(`${base}/:id`, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as any;
    const p = parse(body);
    if (p.error) return reply.code(400).send({ error: 'validation', details: p.error });
    const result = store.updateRecord(
      opts.table,
      opts.entity,
      id,
      p.data,
      body.version ?? null,
      Boolean(body.force),
    );
    if (result.status === 'notfound') return reply.code(404).send({ error: 'not found' });
    if (result.status === 'conflict') {
      return reply.code(409).send({ error: 'conflict', current: result.current });
    }
    return result.record;
  });

  app.delete(`${base}/:id`, async (req, reply) => {
    const { id } = req.params as { id: string };
    const ok = store.deleteRecord(opts.table, opts.entity, id);
    if (!ok) return reply.code(404).send({ error: 'not found' });
    return reply.code(204).send();
  });
}
