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
  // A settlement from setup (turn 0), deleted later in an active turn.
  await createSettlement('New Halvong');
});

afterAll(async () => {
  await app.close();
  closeDb();
});

const json = (res: any) => res.json();

async function patchKingdom(field: string, value: unknown): Promise<void> {
  const kingdom = json(await app.inject({ method: 'GET', url: '/api/kingdom' }));
  const res = await app.inject({
    method: 'PATCH',
    url: '/api/kingdom',
    payload: { data: { ...kingdom.data, [field]: value }, version: kingdom.version },
  });
  expect(res.statusCode).toBe(200);
}

async function createArmy(name: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/armies',
    payload: {
      data: {
        name,
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
  return json(res).id;
}

async function patchArmy(id: string, field: string, value: unknown): Promise<void> {
  const army = json(await app.inject({ method: 'GET', url: `/api/armies/${id}` }));
  const res = await app.inject({
    method: 'PATCH',
    url: `/api/armies/${id}`,
    payload: { data: { ...army.data, [field]: value }, version: army.version },
  });
  expect(res.statusCode).toBe(200);
}

async function createSettlement(name: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/settlements',
    payload: { data: { name, type: 'village', grids: 1, location: '', buildings: [] } },
  });
  expect(res.statusCode).toBe(201);
  return json(res).id;
}

async function patchSettlement(id: string, field: string, value: unknown): Promise<void> {
  const s = json(await app.inject({ method: 'GET', url: `/api/settlements/${id}` }));
  const res = await app.inject({
    method: 'PATCH',
    url: `/api/settlements/${id}`,
    payload: { data: { ...s.data, [field]: value }, version: s.version },
  });
  expect(res.statusCode).toBe(200);
}

async function getLog(): Promise<any> {
  return json(await app.inject({ method: 'GET', url: '/api/turn-log' }));
}

describe('turn log', () => {
  it('does not log setup changes made before the first turn', async () => {
    await patchKingdom('resourcePoints', 3);
    const log = await getLog();
    expect(log.activeTurnNumber).toBeNull();
    expect(log.turns).toHaveLength(0);
  });

  it('next-turn with no active turn starts turn 1 without a lifecycle entry', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/turn-log/next-turn' });
    expect(res.statusCode).toBe(201);
    expect(json(res).data.number).toBe(1);
    const log = await getLog();
    expect(log.activeTurnNumber).toBe(1);
    expect(log.turns[0].number).toBe(1);
    expect(log.turns[0].status).toBe('active');
    // No "Turn 1 created" entry: the active section starts empty.
    expect(log.turns[0].entries).toHaveLength(0);
  });

  it('logs changes made during an active turn with field diffs', async () => {
    await patchKingdom('resourcePoints', 7);
    const log = await getLog();
    const entries = log.turns[0].entries.filter((e: any) => e.entity === 'kingdom');
    expect(entries).toHaveLength(1);
    expect(entries[0].action).toBe('update');
    expect(entries[0].changes).toContainEqual({ field: 'resourcePoints', before: 3, after: 7 });
  });

  it('coalesces repeated changes to the same record into one net entry', async () => {
    await patchKingdom('resourcePoints', 8);
    await patchKingdom('resourcePoints', 9);
    await patchKingdom('resourcePoints', 10);
    const log = await getLog();
    const entries = log.turns[0].entries.filter((e: any) => e.entity === 'kingdom');
    expect(entries).toHaveLength(1);
    expect(entries[0].changes).toContainEqual({ field: 'resourcePoints', before: 3, after: 10 });
  });

  it('logs different fields of the same record as separate entries, in order', async () => {
    await patchKingdom('heartland', 'Water');
    await patchKingdom('notes', 'a quiet kingdom');
    const log = await getLog();
    const entries = log.turns[0].entries.filter((e: any) => e.entity === 'kingdom');
    // resourcePoints (from the earlier tests) plus one entry per new field.
    expect(entries.map((e: any) => e.changes[0].field)).toEqual(['resourcePoints', 'heartland', 'notes']);
    expect(entries[1].changes).toEqual([{ field: 'heartland', before: '', after: 'Water' }]);
    expect(entries[2].changes).toEqual([{ field: 'notes', before: '', after: 'a quiet kingdom' }]);
  });

  it('labels catalog-backed records from the catalog and logs a first save as an update', async () => {
    const skill = json(await app.inject({ method: 'GET', url: '/api/skills/folklore' }));
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/skills/folklore',
      payload: { data: { ...skill.data, proficiency: 'trained' }, version: skill.version },
    });
    expect(res.statusCode).toBe(200);
    const log = await getLog();
    const entries = log.turns[0].entries.filter((e: any) => e.entity === 'skills');
    expect(entries).toHaveLength(1);
    expect(entries[0].action).toBe('update');
    expect(entries[0].label).toBe('Skill: Folklore');
    expect(entries[0].changes).toEqual([
      { field: 'proficiency', before: 'untrained', after: 'trained' },
    ]);
  });

  it('keeps the label plain when the name itself changed', async () => {
    await patchKingdom('name', 'Test Kingdom');
    const log = await getLog();
    const entry = log.turns[0].entries.find(
      (e: any) => e.entity === 'kingdom' && e.changes.some((c: any) => c.field === 'name'),
    );
    expect(entry.label).toBe('Kingdom');
    expect(entry.changes).toEqual([{ field: 'name', before: '', after: 'Test Kingdom' }]);
  });

  it('merges creation with subsequent updates into one entry with final values', async () => {
    const id = await createArmy('Merged Army');
    await patchArmy(id, 'level', 2);
    await patchArmy(id, 'hp', 20);
    const log = await getLog();
    const entries = log.turns[0].entries.filter((e: any) => e.entity === 'armies');
    expect(entries).toHaveLength(1);
    expect(entries[0].action).toBe('create');
    expect(entries[0].label).toBe('Army "Merged Army"');
    expect(entries[0].values).toMatchObject({ level: 2, hp: 20 });
  });

  it('logs deletes with readable labels; create-then-delete leaves no entry', async () => {
    const doomed = await createArmy('Doomed Army');
    expect((await app.inject({ method: 'DELETE', url: `/api/armies/${doomed}` })).statusCode).toBe(204);

    const settlements = json(await app.inject({ method: 'GET', url: '/api/settlements' }));
    const halvong = settlements.find((s: any) => s.data.name === 'New Halvong');
    expect((await app.inject({ method: 'DELETE', url: `/api/settlements/${halvong.id}` })).statusCode).toBe(204);

    // Exists before the next turn; used for the revert test below.
    await createSettlement('Revert Town');

    const log = await getLog();
    const entries = log.turns[0].entries;
    expect(entries.some((e: any) => e.label === 'Army "Doomed Army"')).toBe(false);
    const del = entries.find((e: any) => e.entity === 'settlements' && e.action === 'delete');
    expect(del.label).toBe('Settlement "New Halvong"');
    expect(del.changes).toHaveLength(0);
  });

  it('next-turn finishes the active turn and subsequent changes land in the next turn', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/turn-log/next-turn' });
    expect(res.statusCode).toBe(201);
    expect(json(res).data.number).toBe(2);

    const turns = json(await app.inject({ method: 'GET', url: '/api/turns' }));
    expect(turns.find((t: any) => t.data.number === 1).data.status).toBe('complete');
    expect(turns.find((t: any) => t.data.number === 2).data.status).toBe('active');

    await patchKingdom('fame', 1);
    // A change that is reverted within the turn leaves no entry.
    const town = json(await app.inject({ method: 'GET', url: '/api/settlements' })).find(
      (s: any) => s.data.name === 'Revert Town',
    );
    await patchSettlement(town.id, 'location', 'by the river');
    await patchSettlement(town.id, 'location', '');

    const log = await getLog();
    expect(log.activeTurnNumber).toBe(2);
    const t1 = log.turns.find((t: any) => t.number === 1);
    const t2 = log.turns.find((t: any) => t.number === 2);
    expect(t1.status).toBe('complete');
    expect(
      t1.entries.some((e: any) => e.entity === 'kingdom' && e.changes.some((c: any) => c.field === 'fame')),
    ).toBe(false);
    expect(
      t2.entries.some((e: any) => e.entity === 'kingdom' && e.changes.some((c: any) => c.field === 'fame')),
    ).toBe(true);
    expect(t2.entries.some((e: any) => e.entity === 'settlements')).toBe(false);
    // Turn lifecycle rows never appear in the log.
    for (const t of log.turns) {
      expect(t.entries.some((e: any) => e.entity === 'turns')).toBe(false);
    }
  });

  it('removes entries from the log by their merged row ids', async () => {
    const log = await getLog();
    const t2 = log.turns.find((t: any) => t.number === 2);
    const entry = t2.entries[0];
    expect(Array.isArray(entry.ids)).toBe(true);
    const del = await app.inject({ method: 'DELETE', url: '/api/turn-log', payload: { ids: entry.ids } });
    expect(del.statusCode).toBe(204);
    const after = await getLog();
    expect(after.turns.find((t: any) => t.number === 2).entries).toHaveLength(0);
    const missing = await app.inject({ method: 'DELETE', url: '/api/turn-log', payload: { ids: [999999] } });
    expect(missing.statusCode).toBe(404);
    const invalid = await app.inject({ method: 'DELETE', url: '/api/turn-log', payload: { ids: 'nope' } });
    expect(invalid.statusCode).toBe(400);
  });

  it('backup round-trip preserves the turn log', async () => {
    const exported = json(await app.inject({ method: 'GET', url: '/api/export' }));
    expect(exported.data.audit_log.length).toBeGreaterThan(0);
    const imported = await app.inject({ method: 'POST', url: '/api/import', payload: exported });
    expect(imported.statusCode).toBe(200);
    const log = await getLog();
    expect(log.activeTurnNumber).toBe(2);
    expect(log.turns.map((t: any) => t.number).sort((a: number, b: number) => a - b)).toEqual([1, 2]);
  });
});