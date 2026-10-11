import { randomUUID } from 'node:crypto';
import * as store from './store.js';
import { turnTemplate } from './catalog.js';
import type { StoredRecord } from '@kingdom/shared';

export type StoredTurn = StoredRecord<any>;

/** The turn currently in progress, if any. */
export function findActiveTurn(): StoredTurn | null {
  return store.listAll('turns').find((t) => t.data.status === 'active') ?? null;
}

/**
 * Start the next turn with a step state for every enabled template step.
 * The template itself is static (seed/turn-template.json). Returns an error
 * code instead of throwing; the caller decides transactionality.
 */
export function startTurn(inGameDate: string): { code: number; error?: string; rec?: StoredTurn } {
  if (findActiveTurn()) return { code: 409, error: 'an active turn already exists' };
  const template = turnTemplate();
  const turns = store.listAll('turns');
  const number = turns.length ? Math.max(...turns.map((t) => t.data.number)) + 1 : 1;
  const steps = [...template.steps]
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
    stepState,
  };
  return { code: 201, rec: store.createRecord('turns', 'turns', randomUUID(), data, { number }) };
}

/**
 * Complete a turn: reset per-turn civic flags on all settlements first (so
 * those writes still log to this turn), then mark the turn complete. No step
 * check — callers decide whether steps must be done first.
 */
export function completeTurn(turn: StoredTurn): void {
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
  const next = { ...turn.data, status: 'complete', completedAt: new Date().toISOString() };
  store.updateRecord('turns', 'turns', turn.id, next, turn.version, true);
}