import { useState } from 'react';
import type { KingdomSkill, StoredRecord } from '@kingdom/shared';
import { ConflictDialog } from '../components/ConflictDialog';
import { EditableText } from '../components/EditableText';
import { NumberField } from '../components/NumberField';
import { ConflictError, useDraft, useList, usePatch } from '../hooks/useRecords';

type Proficiency = KingdomSkill['proficiency'];
const PROFICIENCIES: Proficiency[] = ['untrained', 'trained', 'expert', 'master', 'legendary'];

function SkillRow({ rec }: { rec: StoredRecord<KingdomSkill> }) {
  const { draft, setDraft, dirty, baseVersion } = useDraft(rec.data, rec.version);
  const mutate = usePatch<KingdomSkill>('skills', rec.id);
  const [conflict, setConflict] = useState<StoredRecord<KingdomSkill> | null>(null);
  if (!draft) return null;

  const up = <K extends keyof KingdomSkill>(key: K, value: KingdomSkill[K]) =>
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

  return (
    <>
      <tr className="border-b border-zinc-200 last:border-0 dark:border-zinc-800">
        <td className="py-2 pr-3 font-medium">{draft.name}</td>
        <td className="py-2 pr-3 capitalize text-zinc-500 dark:text-zinc-400">{draft.ability}</td>
        <td className="py-2 pr-3">
          <select
            value={draft.proficiency}
            onChange={(e) => up('proficiency', e.target.value as Proficiency)}
            className="field w-28"
          >
            {PROFICIENCIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </td>
        <td className="py-2 pr-3">
          <NumberField value={draft.total} onChange={(v) => up('total', v)} title="Total" />
        </td>
        <td className="py-2 pr-3">
          <EditableText value={draft.breakdown} onChange={(v) => up('breakdown', v)} placeholder="Breakdown" />
        </td>
        <td className="py-2 pr-3">
          <EditableText value={draft.notes} onChange={(v) => up('notes', v)} placeholder="Notes" />
        </td>
        <td className="py-2 text-right">
          <button className="btn-ghost px-2 py-1 text-xs" disabled={!dirty || mutate.isPending} onClick={save}>
            {mutate.isPending ? '…' : dirty ? 'Save' : '✓'}
          </button>
        </td>
      </tr>
      <ConflictDialog
        open={conflict !== null}
        title={`${draft.name} skill`}
        current={conflict}
        onAcceptServer={() => {
          if (conflict) {
            setDraft(conflict.data);
            setConflict(null);
          }
        }}
        onForce={forceSave}
      />
    </>
  );
}

export function SkillsPage() {
  const { data, isLoading, error } = useList<KingdomSkill>('skills');
  if (isLoading) return <p className="text-sm text-zinc-500">Loading skills…</p>;
  if (error || !data) return <p className="text-sm text-red-600 dark:text-red-400">Could not load skills.</p>;
  const rows = [...data].sort((a, b) => a.data.name.localeCompare(b.data.name));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Kingdom Skills</h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Totals are typed in by hand; breakdowns are free notes. Nothing is calculated here.
      </p>
      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              <th className="px-4 py-2">Skill</th>
              <th className="px-3 py-2">Ability</th>
              <th className="px-3 py-2">Proficiency</th>
              <th className="px-3 py-2">Total</th>
              <th className="px-3 py-2">Breakdown</th>
              <th className="px-3 py-2">Notes</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((rec) => (
              <SkillRow key={rec.id} rec={rec} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}