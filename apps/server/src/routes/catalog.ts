import type { FastifyInstance } from 'fastify';
import * as catalog from '../catalog.js';
import * as store from '../store.js';
import { CATALOG_STATES, ensureStateRow, mergedRecord } from '../catalog-state.js';

/**
 * Static rules content (seed/*.json, read on every request) and the
 * catalog-backed entities that merge it with user-entered state.
 */
export function registerCatalogRoutes(app: FastifyInstance, apiPrefix: string): void {
  const readOnly: Record<string, () => unknown> = {
    activities: catalog.activities,
    reference: catalog.referenceTables,
    'structure-defs': catalog.structureDefs,
    'turn-template': catalog.turnTemplate,
  };
  for (const [path, read] of Object.entries(readOnly)) {
    app.get(`${apiPrefix}/${path}`, async (req, reply) => {
      try {
        return read();
      } catch (e) {
        app.log.error(e, `failed to read ${path} catalog`);
        return reply.code(500).send({ error: `failed to read ${path}` });
      }
    });
  }

  for (const def of CATALOG_STATES) {
    const base = `${apiPrefix}/${def.entity}`;

    app.get(base, async () => [...def.defs()].map(([id, data]) => mergedRecord(def, id, data)));

    app.get(`${base}/:id`, async (req, reply) => {
      const { id } = req.params as { id: string };
      const data = def.defs().get(id);
      if (!data) return reply.code(404).send({ error: 'not found' });
      return mergedRecord(def, id, data);
    });

    // Accepts the merged record (as returned by GET) and stores only its
    // state fields. Version 0 means "never saved"; the defaults row is created
    // on the fly so the change is audited as an update.
    app.patch(`${base}/:id`, async (req, reply) => {
      const { id } = req.params as { id: string };
      const staticData = def.defs().get(id);
      if (!staticData) return reply.code(404).send({ error: 'not found' });
      const body = req.body as any;
      const parsed = def.fullSchema.safeParse({ ...(body?.data ?? body), ...staticData });
      if (!parsed.success) {
        return reply.code(400).send({ error: 'validation', details: parsed.error.flatten() });
      }
      const state = def.stateSchema.parse(parsed.data);
      const existed = Boolean(store.getById(def.table, id));
      ensureStateRow(def.table, id);
      let expected: number | null = body.version ?? null;
      if (!existed && expected === 0) expected = 1;
      const result = store.updateRecord(def.table, def.entity, id, state, expected, Boolean(body.force));
      if (result.status === 'conflict') {
        return reply.code(409).send({ error: 'conflict', current: mergedRecord(def, id, staticData) });
      }
      return mergedRecord(def, id, staticData);
    });
  }
}
