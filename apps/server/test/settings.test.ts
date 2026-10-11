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

describe('settings: reset', () => {
  it('restores the database to the default seed state', async () => {
    // Modify the kingdom, start a turn, and add records.
    const kingdom = json(await app.inject({ method: 'GET', url: '/api/kingdom' }));
    let res = await app.inject({
      method: 'PATCH',
      url: '/api/kingdom',
      payload: { data: { ...kingdom.data, name: 'Reset Me', resourcePoints: 5 }, version: kingdom.version },
    });
    expect(res.statusCode).toBe(200);
    res = await app.inject({ method: 'POST', url: '/api/turn-log/next-turn' });
    expect(res.statusCode).toBe(201);
    res = await app.inject({
      method: 'POST',
      url: '/api/armies',
      payload: {
        data: {
          name: 'Scratch Army',
          type: 'infantry',
          level: 1,
          scouting: null,
          recruitmentDc: null,
          consumption: null,
          ac: null,
          maneuver: null,
          morale: null,
          hp: 10,
          maxHp: 10,
          routThreshold: null,
          attacks: [],
          tactics: [],
          gear: [],
          specialAbilities: [],
          conditions: [],
          location: '',
          recruitedOnTurn: null,
          status: 'active',
          notes: '',
        },
      },
    });
    expect(res.statusCode).toBe(201);

    // Reset.
    const reset = await app.inject({ method: 'POST', url: '/api/reset' });
    expect(reset.statusCode).toBe(200);
    expect(json(reset)).toEqual({ ok: true });

    // The kingdom is back to its defaults.
    const fresh = json(await app.inject({ method: 'GET', url: '/api/kingdom' }));
    expect(fresh.data.name).toBe('');
    expect(fresh.data.resourcePoints).toBeNull();

    // No turns, no log entries, no armies.
    const log = json(await app.inject({ method: 'GET', url: '/api/turn-log' }));
    expect(log.activeTurnNumber).toBeNull();
    expect(log.turns).toHaveLength(0);
    expect(json(await app.inject({ method: 'GET', url: '/api/armies' }))).toHaveLength(0);

    // Defaults are back: no settlements, and the 16 skills from the catalog.
    const settlements = json(await app.inject({ method: 'GET', url: '/api/settlements' }));
    expect(settlements).toHaveLength(0);
    expect(json(await app.inject({ method: 'GET', url: '/api/skills' }))).toHaveLength(16);

    // The reset is repeatable.
    const again = await app.inject({ method: 'POST', url: '/api/reset' });
    expect(again.statusCode).toBe(200);
  });
});