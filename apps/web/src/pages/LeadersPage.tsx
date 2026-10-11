import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Leader, StoredRecord } from '@kingdom/shared';
import { ConflictDialog } from '../components/ConflictDialog';
import { EditableText } from '../components/EditableText';
import { describeSaveError } from '../lib/api';
import {
  ConflictError,
  useAutoRefetchOnError,
  useAutosave,
  useDraft,
  useList,
  usePatch,
} from '../hooks/useRecords';

function LeaderCard({ rec }: { rec: StoredRecord<Leader> }) {
  const qc = useQueryClient();
  const { draft, setDraft, dirty, baseVersion, bumpBaseVersion } = useDraft(rec.data, rec.version);
  const mutate = usePatch<Leader>('leaders', rec.id);
  const [conflict, setConflict] = useState<StoredRecord<Leader> | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const save = () => {
    if (!draft) return;
    mutate.mutate(
      { data: draft, version: baseVersion ?? rec.version },
      {
        onSuccess: (saved) => {
          setSaveError(null);
          bumpBaseVersion(saved.version);
        },
        onError: (e) => {
          if (e instanceof ConflictError) setConflict(e.current);
          else setSaveError(describeSaveError(e));
        },
      },
    );
  };
  useAutosave({ draft, dirty, isPending: mutate.isPending, paused: conflict !== null, save });

  if (!draft) return null;

  const up = <K extends keyof Leader>(key: K, value: Leader[K]) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d));

  const forceSave = () => {
    if (!conflict) return;
    mutate.mutate(
      { data: draft, version: conflict.version, force: true },
      {
        onSuccess: (saved) => {
          setSaveError(null);
          bumpBaseVersion(saved.version);
          setConflict(null);
        },
        onError: (e) => {
          if (e instanceof ConflictError) setConflict(e.current);
          else setSaveError(describeSaveError(e));
        },
      },
    );
  };

  // Only PCs get activities per turn, and a PC always gets 3.
  const setPc = (checked: boolean) =>
    setDraft((d) => (d ? { ...d, isPC: checked, activitiesPerTurn: checked ? 3 : null } : d));

  const check = (key: 'invested' | 'vacant', label: string) => (
    <label className="flex items-center gap-1.5 text-sm">
      <input
        type="checkbox"
        checked={draft[key]}
        onChange={(e) => up(key, e.target.checked)}
        className="h-4 w-4 accent-amber-600"
      />
      {label}
    </label>
  );

  return (
    <div className="card">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          {draft.role}
        </h2>
      </div>
      {saveError && (
        <p className="mb-3 rounded-md bg-red-600/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">
          Save failed: {saveError}
        </p>
      )}
      <div className="space-y-3">
        <div>
          <span className="label">Holder</span>
          <EditableText value={draft.holderName} onChange={(v) => up('holderName', v)} placeholder="Leader name" />
        </div>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              checked={draft.isPC}
              onChange={(e) => setPc(e.target.checked)}
              className="h-4 w-4 accent-amber-600"
            />
            PC
          </label>
          {check('invested', 'Invested')}
          {check('vacant', 'Vacant')}
        </div>
        <div>
          <span className="label">Notes</span>
          <EditableText textarea value={draft.notes} onChange={(v) => up('notes', v)} />
        </div>
      </div>
      <ConflictDialog
        open={conflict !== null}
        title={`${draft.role} leader`}
        current={conflict}
        onAcceptServer={() => {
          if (conflict) {
            qc.setQueryData<StoredRecord<Leader>[]>(['leaders'], (list) =>
              list ? list.map((r) => (r.id === conflict.id ? conflict : r)) : list,
            );
            setDraft(conflict.data);
            setConflict(null);
            setSaveError(null);
          }
        }}
        onForce={forceSave}
      />
    </div>
  );
}

export function LeadersPage() {
  const { data, isLoading, error, isFetching, refetch } = useList<Leader>('leaders');
  useAutoRefetchOnError(error, isFetching, refetch);
  if (isLoading) return <p className="text-sm text-zinc-500">Loading leaders…</p>;
  if (error || !data) {
    return (
      <div className="card mx-auto max-w-md text-center">
        <p className="mb-3 text-sm text-red-600 dark:text-red-400">Could not load leaders.</p>
        <button className="btn-primary" onClick={() => refetch()}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Leaders</h1>
      <div className="grid gap-4 md:grid-cols-2">
        {data.map((rec) => (
          <LeaderCard key={rec.id} rec={rec} />
        ))}
      </div>
    </div>
  );
}