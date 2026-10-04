import { describe, it, expect } from 'vitest';
import { resolveTarget, applyChangeToData } from '../src/changes.js';

describe('resolveTarget', () => {
  it('resolves kingdom top-level fields', () => {
    expect(resolveTarget('kingdom.resourcePoints')).toEqual({
      table: 'kingdom',
      entity: 'kingdom',
      id: null,
      path: ['resourcePoints'],
    });
  });

  it('resolves nested kingdom fields', () => {
    expect(resolveTarget('kingdom.abilities.economy.score')).toEqual({
      table: 'kingdom',
      entity: 'kingdom',
      id: null,
      path: ['abilities', 'economy', 'score'],
    });
  });

  it('resolves per-record targets', () => {
    expect(resolveTarget('settlements.abc-123.influence')).toEqual({
      table: 'settlements',
      entity: 'settlements',
      id: 'abc-123',
      path: ['influence'],
    });
  });

  it('rejects unknown entities and malformed targets', () => {
    expect(resolveTarget('bogus.field')).toBeNull();
    expect(resolveTarget('kingdom')).toBeNull();
    expect(resolveTarget('settlements.onlyid')).toBeNull();
  });
});

describe('applyChangeToData', () => {
  it('applies a delta to a number', () => {
    const data = { resourcePoints: 5 };
    const { before, after } = applyChangeToData(data, ['resourcePoints'], 'delta', 3);
    expect(before).toBe(5);
    expect(after).toBe(8);
    expect(data.resourcePoints).toBe(8);
  });

  it('treats a null before-value as 0 for deltas', () => {
    const data = { unrest: null };
    const { before, after } = applyChangeToData(data, ['unrest'], 'delta', 1);
    expect(before).toBeNull();
    expect(after).toBe(1);
  });

  it('applies a set', () => {
    const data = { level: 3 };
    const { before, after } = applyChangeToData(data, ['level'], 'set', 4);
    expect(before).toBe(3);
    expect(after).toBe(4);
  });

  it('applies to nested paths', () => {
    const data = { commodities: { food: { stored: 10, capacity: 20 } } };
    const { after } = applyChangeToData(data, ['commodities', 'food', 'stored'], 'delta', -4);
    expect(after).toBe(6);
  });

  it('throws on a missing path', () => {
    const data = { a: { b: 1 } };
    expect(() => applyChangeToData(data, ['a', 'c', 'd'], 'set', 1)).toThrow();
  });
});
