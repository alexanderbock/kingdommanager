import { useState } from 'react';
import type { Leader, StoredRecord } from '@kingdom/shared';
import { ConflictDialog } from '../components/ConflictDialog';
import { EditableText } from '../components/EditableText';
import { NumberField } from '../components/NumberField';
import { ConflictError, useDraft, useList, usePatch } from '../hooks/useRecords';

function LeaderCard({ rec }: { rec: StoredRecord<Leader> }) {
  const { draft, setDraft, dirty, baseVersion } = useDraft(rec.data, rec.version);
  const mutate = usePatch<Leader>('leaders', rec.id);
  const [conflict, setConflict] = useState<StoredRecord<Leader> | null>(null);
  if (!draft) return null;

  const up = <K extends keyof Leader>(key: K, value: Leader[K]) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d));

  const save = () =>
    mutate.mutate(
      { data: draft, version: baseVersion ?? rec.version },
      { onError: (e) => e instanceof ConflictError && setConflict(e.current) },
    );
  const forceSave = () => {
    if (!conflict) return;
    mutate.mutate(
      { data: draft, version: conflict.version, force: true },
      {
        onSuccess: () => setConflict(null),
        onError: (e) => e instanceof ConflictError && setConflict(e.current),
      },
    );
  };

  const check = (key: 'isPC' | 'invested' | 'vacant', label: string) => (
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
        <button className="btn-ghost px-2 py-1 text-xs" disabled={!dirty || mutate.isPending} onClick={save}>
          {mutate.isPending ? '…' : dirty ? 'Save' : '✓'}
        </button>
      </div>
      <div className="space-y-3">
        <div>
          <span className="label">Holder</span>
          <EditableText value={draft.holderName} onChange={(v) => up('holderName', v)} placeholder="Leader name" />
        </div>
        <div className="flex flex-wrap gap-4">
          {check('isPC', 'PC')}
          {check('invested', 'Invested')}
          {check('vacant', 'Vacant')}
        </div>
        <div>
          <span className="label">Activities per turn</span>
          <NumberField value={draft.activitiesPerTurn} onChange={(v) => up('activitiesPerTurn', v)} />
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
            setDraft(conflict.data);
            setConflict(null);
          }
        }}
        onForce={forceSave}
      />
    </div>
  );
}

export function LeadersPage() {
  const { data, isLoading, error } = useList<Leader>('leaders');
  if (isLoading) return <p className="text-sm text-zinc-500">Loading leaders…</p>;
  if (error || !data) return <p className="text-sm text-red-600 dark:text-red-400">Could not load leaders.</p>;

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