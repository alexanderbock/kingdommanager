import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Kingdom, StoredRecord } from '@kingdom/shared';
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

export function useList<T>(entity: string) {
  return useQuery({
    queryKey: [entity],
    queryFn: () => apiFetch<StoredRecord<T>[]>(`/${entity}`),
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
  return { draft, setDraft, dirty, baseVersion };
}