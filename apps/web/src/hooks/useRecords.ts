import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Kingdom, StoredRecord, TurnLogResponse } from '@kingdom/shared';
import { ApiError, apiFetch } from '../lib/api';

/** Thrown when the server rejects a save with a version conflict (409). */
export class ConflictError extends Error {
  constructor(public current: StoredRecord<any>) {
    super('version conflict');
  }
}

function wrapConflict<T>(p: Promise<StoredRecord<T>>): Promise<StoredRecord<T>> {
  return p.catch((e) => {
    if (e instanceof ApiError && e.status === 409) throw new ConflictError(e.body?.current);
    throw e;
  });
}

/**
 * While a query is in an error state, keep refetching in the background so
 * the page recovers on its own as soon as the server becomes reachable
 * (e.g. the API is still booting when the page first loads).
 */
export function useAutoRefetchOnError(error: unknown, isFetching: boolean, refetch: () => unknown): void {
  useEffect(() => {
    if (!error || isFetching) return;
    const t = setInterval(() => {
      void refetch();
    }, 5000);
    return () => clearInterval(t);
  }, [error, isFetching, refetch]);
}

export function useKingdom() {
  return useQuery({
    queryKey: ['kingdom'],
    queryFn: () => apiFetch<StoredRecord<Kingdom>>('/kingdom'),
  });
}

export function useActiveTurn() {
  return useQuery({
    queryKey: ['turns', 'active'],
    queryFn: () => apiFetch<StoredRecord<any>>('/turns/active'),
    retry: false,
  });
}

/** All turns, newest first. */
export function useTurns() {
  return useQuery({
    queryKey: ['turns'],
    queryFn: () => apiFetch<StoredRecord<any>[]>('/turns'),
  });
}

/** Turn log: every change grouped by turn (setup/turn 0 excluded). */
export function useTurnLog() {
  return useQuery({
    queryKey: ['turn-log'],
    queryFn: () => apiFetch<TurnLogResponse>('/turn-log'),
  });
}

/** Remove one log entry (all of its merged audit rows) from the turn log. */
export function useDeleteTurnLogEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: number[]) =>
      apiFetch<void>('/turn-log', { method: 'DELETE', body: JSON.stringify({ ids }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['turn-log'] }),
  });
}

/** Finish the active turn (if any) and start the next one. */
export function useNextTurn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (inGameDate?: string) =>
      apiFetch<StoredRecord<any>>('/turn-log/next-turn', {
        method: 'POST',
        body: JSON.stringify({ inGameDate: inGameDate ?? '' }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['turn-log'] });
      qc.invalidateQueries({ queryKey: ['turns'] });
    },
  });
}

/**
 * PATCH one step of a turn (done, checklist, notes, activities,
 * currentStepKey). The server applies the patch to the current version, so
 * rapid successive saves never conflict.
 */
export function usePatchStep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { turnNumber: number; stepKey: string; patch: Record<string, unknown> }) =>
      apiFetch<StoredRecord<any>>(`/turns/${args.turnNumber}/steps/${encodeURIComponent(args.stepKey)}`, {
        method: 'PATCH',
        body: JSON.stringify(args.patch),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['turns'] }),
  });
}

export function useList<T>(entity: string) {
  return useQuery({
    queryKey: [entity],
    queryFn: () => apiFetch<StoredRecord<T>[]>(`/${entity}`),
  });
}

/**
 * Static rules content (activities, turn template, ...). Served as plain JSON
 * read from the server's seed files, not as stored records.
 */
export function useCatalog<T>(path: 'activities' | 'reference' | 'structure-defs' | 'turn-template') {
  return useQuery({
    queryKey: ['catalog', path],
    queryFn: () => apiFetch<T>(`/${path}`),
  });
}

export interface PatchArgs<T> {
  data: T;
  version: number | null;
  force?: boolean;
}

/** PATCH the kingdom singleton with conflict detection. */
export function usePatchKingdom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: PatchArgs<Kingdom>) =>
      wrapConflict(apiFetch<StoredRecord<Kingdom>>('/kingdom', { method: 'PATCH', body: JSON.stringify(args) })),
    onSuccess: (rec) => qc.setQueryData(['kingdom'], rec),
  });
}

/** PATCH one record of a list entity with conflict detection. */
export function usePatch<T>(entity: string, id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: PatchArgs<T>) =>
      wrapConflict(
        apiFetch<StoredRecord<T>>(`/${entity}/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          body: JSON.stringify(args),
        }),
      ),
    onSuccess: (rec) => {
      qc.setQueryData<StoredRecord<T>[]>([entity], (list) =>
        list ? list.map((r) => (r.id === rec.id ? rec : r)) : list,
      );
    },
  });
}

/** POST a new record of a list entity. */
export function useCreate<T>(entity: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: T) =>
      apiFetch<StoredRecord<T>>(`/${entity}`, { method: 'POST', body: JSON.stringify({ data }) }),
    onSuccess: (rec) => {
      qc.setQueryData<StoredRecord<T>[]>([entity], (list) => (list ? [...list, rec] : [rec]));
    },
  });
}

/** DELETE one record of a list entity. */
export function useDelete(entity: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/${entity}/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    onSuccess: (_res, id) => {
      qc.setQueryData<StoredRecord<any>[]>([entity], (list) =>
        list ? list.filter((r) => r.id !== id) : list,
      );
    },
  });
}

/**
 * Local draft of a record's data. Adopts new server values while the draft
 * is clean; keeps user edits while dirty. `baseVersion` is the version the
 * draft was created from, so a stale save surfaces the conflict dialog
 * instead of silently clobbering a newer server copy.
 */
export function useDraft<T>(source: T | undefined, sourceVersion?: number) {
  const [draft, setDraft] = useState<T | undefined>(source);
  const [baseVersion, setBaseVersion] = useState<number | undefined>(sourceVersion);
  const lastSource = useRef(source);
  if (source !== lastSource.current) {
    lastSource.current = source;
    const clean = draft === undefined || JSON.stringify(draft) === JSON.stringify(source);
    if (clean) {
      setDraft(source);
      setBaseVersion(sourceVersion);
    }
  }
  const dirty =
    draft !== undefined && source !== undefined && JSON.stringify(draft) !== JSON.stringify(source);
  return { draft, setDraft, dirty, baseVersion, bumpBaseVersion: setBaseVersion };
}

const AUTOSAVE_DELAY_MS = 800;

/**
 * Autosave: debounces `save` while the draft changes, waits for an in-flight
 * save before firing the next one, saves right away when a save completes
 * with newer edits pending, and flushes on unmount. Paused while a conflict
 * dialog is open.
 */
export function useAutosave(opts: {
  draft: unknown;
  dirty: boolean;
  isPending: boolean;
  paused?: boolean;
  save: () => void;
}): void {
  const { draft, dirty, isPending, paused, save } = opts;
  const saveRef = useRef(save);
  saveRef.current = save;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const pendingRef = useRef(isPending);
  pendingRef.current = isPending;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const wasPending = useRef(isPending);

  // Debounce: restart the timer on every draft change.
  useEffect(() => {
    if (!dirty || isPending || paused) return;
    const t = setTimeout(() => saveRef.current(), AUTOSAVE_DELAY_MS);
    return () => clearTimeout(t);
  }, [draft, dirty, isPending, paused]);

  // A save just finished and there are newer edits: save right away.
  useEffect(() => {
    const was = wasPending.current;
    wasPending.current = isPending;
    if (was && !isPending && dirty && !paused) saveRef.current();
  }, [isPending, dirty, paused]);

  // Navigating away must not drop the latest edits (unless a conflict is
  // still unresolved, in which case saving would just 409 again).
  useEffect(() => {
    return () => {
      if (dirtyRef.current && !pendingRef.current && !pausedRef.current) saveRef.current();
    };
  }, []);
}