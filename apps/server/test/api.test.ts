import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { initDb, closeDb } from '../src/db.js';
import { seedIfEmpty } from '../src/seed.js';
import { buildApp } from '../src/app.js';

let app: FastifyInstance;

beforeAll(async () => {
  initDb(':memory:');
  seedIfEmpty();
  app = await buildApp({
    port: 0,
    host: '127.0.0.1',
    basePath: '/',
    dbPath: ':memory:',
    webDist: 'nonexistent',
  });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  closeDb();
});

const json = (res: any) => res.json();

describe('health and seed', () => {
  it('GET /api/health', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(json(res).status).toBe('ok');
  });

  it('seeds 16 skills and 8 leaders', async () => {
    const skills = json(await app.inject({ method: 'GET', url: '/api/skills' }));
    const leaders = json(await app.inject({ method: 'GET', url: '/api/leaders' }));
    expect(skills).toHaveLength(16);
    expect(leaders).toHaveLength(8);
    expect(skills.find((s: any) => s.data.key === 'agriculture')).toBeTruthy();
  });

  it('seeds the 17-step turn template and 36 milestones', async () => {
    const template = json(await app.inject({ method: 'GET', url: '/api/turn-template' }));
    expect(template.data.steps).toHaveLength(17);
    const milestones = json(await app.inject({ method: 'GET', url: '/api/milestones' }));
    expect(milestones).toHaveLength(36);
  });
});

describe('kingdom versioning', () => {
  it('PATCH /api/kingdom updates and bumps version', async () => {
    const before = json(await app.inject({ method: 'GET', url: '/api/kingdom' }));
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/kingdom',
      payload: { data: { ...before.data, resourcePoints: 5 }, version: before.version },
    });
    expect(res.statusCode).toBe(200);
    const after = json(res);
    expect(after.data.resourcePoints).toBe(5);
    expect(after.version).toBe(before.version + 1);
  });

  it('stale version returns 409 with the current record', async () => {
    const current = json(await app.inject({ method: 'GET', url: '/api/kingdom' }));
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/kingdom',
      payload: { data: { ...current.data, resourcePoints: 99 }, version: current.version - 1 },
    });
    expect(res.statusCode).toBe(409);
    expect(json(res).current.version).toBe(current.version);
  });

  it('force overwrites a conflict', async () => {
    const current = json(await app.inject({ method: 'GET', url: '/api/kingdom' }));
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/kingdom',
      payload: {
        data: { ...current.data, resourcePoints: 7 },
        version: current.version - 1,
        force: true,
      },
    });
    expect(res.statusCode).toBe(200);
    expect(json(res).data.resourcePoints).toBe(7);
  });
});


describe('turn lifecycle', () => {
  it('starts a turn, logs a check with an RP change, and completes it', async () => {
    // Start
    const start = await app.inject({ method: 'POST', url: '/api/turns', payload: { inGameDate: 'Day 1' } });
    expect(start.statusCode).toBe(201);
    const turn = json(start);
    expect(turn.data.number).toBe(1);
    expect(turn.data.status).toBe('active');
    expect(Object.keys(turn.data.stepState)).toHaveLength(16); // 17 steps minus disabled army-activities

    // A second active turn is rejected
    const dup = await app.inject({ method: 'POST', url: '/api/turns', payload: {} });
    expect(dup.statusCode).toBe(409);

    // Log a check that adds +2 RP (delta)
    const log = await app.inject({
      method: 'POST',
      url: `/api/turns/1/log`,
      payload: {
        turnId: turn.id,
        stepKey: 'resource-collection',
        actor: 'GM',
        activityKey: null,
        skillKey: null,
        factionId: null,
        modifierUsed: null,
        dc: null,
        roll: 12,
        outcome: 'success',
        summary: 'Rolled resource dice',
        changes: [{ target: 'kingdom.resourcePoints', mode: 'delta', value: 2 }],
      },
    });
    expect(log.statusCode).toBe(201);
    const entry = json(log);
    expect(entry.data.changes).toHaveLength(1);
    expect(entry.data.changes[0].before).toBe(7);
    expect(entry.data.changes[0].after).toBe(9);

    const kingdom = json(await app.inject({ method: 'GET', url: '/api/kingdom' }));
    expect(kingdom.data.resourcePoints).toBe(9);

    // Unknown change target is rejected
    const bad = await app.inject({
      method: 'POST',
      url: `/api/turns/1/log`,
      payload: {
        turnId: turn.id,
        stepKey: 'resource-collection',
        actor: 'GM',
        activityKey: null,
        skillKey: null,
        factionId: null,
        modifierUsed: null,
        dc: null,
        roll: null,
        outcome: 'n/a',
        summary: 'bad target',
        changes: [{ target: 'kingdom.nope', mode: 'set', value: 1 }],
      },
    });
    expect(bad.statusCode).toBe(400);

    // Complete is blocked while steps are open
    const early = await app.inject({ method: 'POST', url: '/api/turns/1/complete' });
    expect(early.statusCode).toBe(400);

    // Mark every step done
    for (const step of turn.data.template.steps) {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/turns/1/steps/${step.key}`,
        payload: { done: true },
      });
      expect(res.statusCode).toBe(200);
    }

    const done = await app.inject({ method: 'POST', url: '/api/turns/1/complete' });
    expect(done.statusCode).toBe(200);
    expect(json(done).data.status).toBe('complete');

    // Completed turns are read-only
    const frozen = await app.inject({
      method: 'PATCH',
      url: `/api/turns/1/steps/${turn.data.template.steps[0].key}`,
      payload: { notes: 'too late' },
    });
    expect(frozen.statusCode).toBe(400);

    // Summary includes the log entry with its change
    const summary = json(await app.inject({ method: 'GET', url: '/api/turns/1' }));
    expect(summary.log).toHaveLength(1);
    expect(summary.log[0].data.changes[0].after).toBe(9);
  }, 30000);
});

describe('export and import', () => {
  it('round-trips the whole database', async () => {
    const exportRes = json(await app.inject({ method: 'GET', url: '/api/export' }));
    expect(exportRes.app).toBe('kingdom-manager');
    expect(exportRes.data.kingdom).toHaveLength(1);
    expect(exportRes.data.turns).toHaveLength(1);

    const importRes = await app.inject({
      method: 'POST',
      url: '/api/import',
      payload: exportRes,
    });
    expect(importRes.statusCode).toBe(200);

    const kingdom = json(await app.inject({ method: 'GET', url: '/api/kingdom' }));
    expect(kingdom.data.resourcePoints).toBe(9);
    const turns = json(await app.inject({ method: 'GET', url: '/api/turns' }));
    expect(turns).toHaveLength(1);
    expect(turns[0].data.status).toBe('complete');
  });

  it('rejects an invalid backup document', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/import', payload: { app: 'nope' } });
    expect(res.statusCode).toBe(400);
  });
});
