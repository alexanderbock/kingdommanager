import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { StructureDefSchema } from '@kingdom/shared';
import * as store from '../store.js';

const params = (req: any): Record<string, string> => req.params as Record<string, string>;

/**
 * Structure catalog: standard CRUD plus a bulk import that upserts by name.
 * Placed structure instances live under /structures (standard CRUD) and are
 * also listed per settlement at /settlements/:id/structures.
 */
export function registerStructureRoutes(app: FastifyInstance, apiPrefix: string): void {
  app.post(`${apiPrefix}/structure-defs/import`, async (req, reply) => {
    const body = req.body as any;
    const parsed = StructureDefSchema.array().safeParse(body.defs);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'validation', details: parsed.error.flatten() });
    }
    let created = 0;
    let updated = 0;
    for (const def of parsed.data) {
      const existing = store.getById('structure_defs', def.name);
      if (existing) {
        store.updateRecord('structure_defs', 'structure-defs', def.name, def, existing.version, true);
        updated += 1;
      } else {
        store.createRecord('structure_defs', 'structure-defs', def.name, def);
        created += 1;
      }
    }
    return { ok: true, created, updated };
  });

  app.get(`${apiPrefix}/settlements/:id/structures`, async (req, reply) => {
    const settlement = store.getById('settlements', params(req).id);
    if (!settlement) return reply.code(404).send({ error: 'not found' });
    const instances = store
      .listAll('structure_instances')
      .filter((s) => s.data.settlementId === settlement.id);
    return instances;
  });

  // Keep instance <-> lot links consistent when an instance is removed.
  app.addHook('onResponse', async (req, reply) => {
    if (req.method !== 'DELETE' || !req.url.startsWith(`${apiPrefix}/structures/`)) return;
    if (reply.statusCode !== 204) return;
    const id = req.url.slice(`${apiPrefix}/structures/`.length).split('?')[0];
    for (const s of store.listAll('settlements')) {
      const blocks = s.data.blocks.map((b: any) => ({
        ...b,
        lots: b.lots.map((l: any) =>
          l.structureInstanceId === id ? { ...l, structureInstanceId: null } : l,
        ),
      }));
      if (JSON.stringify(blocks) !== JSON.stringify(s.data.blocks)) {
        store.updateRecord('settlements', 'settlements', s.id, { ...s.data, blocks }, s.version, true);
      }
    }
  });

  void randomUUID;
}
