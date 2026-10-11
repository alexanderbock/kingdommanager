import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Config } from './config.js';
import {
  KingdomSkillSchema,
  LeaderSchema,
  FeatSchema,
  ModifierSchema,
  SettlementSchema,
  StructureInstanceSchema,
  StructureDefSchema,
  ArmySchema,
  KingdomEventSchema,
  HexSchema,
  FactionSchema,
  MilestoneSchema,
  TurnTemplateSchema,
  ActivitySchema,
  ReferenceTableSchema,
} from '@kingdom/shared';
import { registerSseRoutes } from './sse.js';
import * as store from './store.js';
import { registerCrud } from './routes/crud.js';
import { registerKingdomRoutes } from './routes/kingdom.js';
import { registerTurnRoutes } from './routes/turns.js';
import { registerLogRoutes } from './routes/log.js';
import { registerStructureRoutes } from './routes/structures.js';
import { registerBackupRoutes } from './routes/backup.js';
import { registerLeadershipRoutes } from './routes/leadership.js';

/** Build the Fastify app (routes + static serving) without listening. */
export async function buildApp(config: Config): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? 'info' },
  });
  const api = `${config.basePath}api`;

  app.get(`${api}/health`, async () => ({ status: 'ok', time: new Date().toISOString() }));

  registerSseRoutes(app, api);
  registerKingdomRoutes(app, api);
  registerStructureRoutes(app, api);
  registerLeadershipRoutes(app, api);
  registerTurnRoutes(app, api);
  registerLogRoutes(app, api);
  registerBackupRoutes(app, api);

  registerCrud(app, api, { table: 'kingdom_skills', entity: 'skills', schema: KingdomSkillSchema, keyField: 'key' });
  registerCrud(app, api, { table: 'leaders', entity: 'leaders', schema: LeaderSchema, keyField: 'role' });
  registerCrud(app, api, { table: 'feats', entity: 'feats', schema: FeatSchema });
  registerCrud(app, api, { table: 'modifiers', entity: 'modifiers', schema: ModifierSchema });
  registerCrud(app, api, { table: 'settlements', entity: 'settlements', schema: SettlementSchema });
  registerCrud(app, api, { table: 'structure_instances', entity: 'structures', schema: StructureInstanceSchema });
  registerCrud(app, api, { table: 'structure_defs', entity: 'structure-defs', schema: StructureDefSchema, keyField: 'name' });
  registerCrud(app, api, { table: 'armies', entity: 'armies', schema: ArmySchema });
  registerCrud(app, api, { table: 'kingdom_events', entity: 'events', schema: KingdomEventSchema });
  registerCrud(app, api, { table: 'hexes', entity: 'hexes', schema: HexSchema });
  registerCrud(app, api, { table: 'factions', entity: 'factions', schema: FactionSchema });
  registerCrud(app, api, { table: 'milestones', entity: 'milestones', schema: MilestoneSchema, keyField: 'name' });
  registerCrud(app, api, { table: 'activities', entity: 'activities', schema: ActivitySchema, keyField: 'key' });
  registerCrud(app, api, { table: 'reference_tables', entity: 'reference', schema: ReferenceTableSchema, keyField: 'key' });

  // turn-template is a singleton: GET returns it, PUT replaces it.
  app.get(`${api}/turn-template`, async (req, reply) => {
    const rec = store.getById('turn_template', 'turn-template');
    if (!rec) return reply.code(404).send({ error: 'not found' });
    return rec;
  });

  app.put(`${api}/turn-template`, async (req, reply) => {
    const body = req.body as any;
    const parsed = TurnTemplateSchema.safeParse(body?.data ?? body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'validation', details: parsed.error.flatten() });
    }
    const result = store.updateRecord(
      'turn_template',
      'turn-template',
      'turn-template',
      parsed.data,
      body.version ?? null,
      Boolean(body.force),
    );
    if (result.status === 'conflict') {
      return reply.code(409).send({ error: 'conflict', current: result.current });
    }
    if (result.status === 'notfound') {
      return reply.code(404).send({ error: 'not found' });
    }
    return result.record;
  });

  // Static frontend + SPA fallback for any non-API path under BASE_PATH.
  if (existsSync(config.webDist)) {
    await app.register(fastifyStatic, {
      root: config.webDist,
      prefix: config.basePath,
      setHeaders: (res, filePath) => {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    });
    app.setNotFoundHandler((req, reply) => {
      const url = req.raw.url ?? '';
      if (
        req.method === 'GET' &&
        url.startsWith(config.basePath) &&
        !url.startsWith(`${config.basePath}api`)
      ) {
        const index = path.join(config.webDist, 'index.html');
        if (existsSync(index)) {
          reply.header('Cache-Control', 'no-cache');
          return reply.type('text/html; charset=utf-8').send(readFileSync(index));
        }
      }
      return reply.code(404).send({ error: 'not found' });
    });
  }

  return app;
}
