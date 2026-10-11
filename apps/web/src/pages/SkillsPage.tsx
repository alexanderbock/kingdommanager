import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { KingdomSkill, StoredRecord } from '@kingdom/shared';
import { ConflictDialog } from '../components/ConflictDialog';
import { EditableText } from '../components/EditableText';
import { NumberField } from '../components/NumberField';
import { describeSaveError } from '../lib/api';
import {
  ConflictError,
  useAutoRefetchOnError,
  useAutosave,
  useDraft,
  useKingdom,
  useList,
  usePatch,
} from '../hooks/useRecords';

type Proficiency = KingdomSkill['proficiency'];
const PROFICIENCIES: Proficiency[] = ['untrained', 'trained', 'expert', 'master', 'legendary'];

/** Standard proficiency bonus for a kingdom skill at the given kingdom level. */
function profBonusFor(level: number | null, prof: Proficiency, untrainedImprovisation: boolean): number | null {
  if (level === null) return null;
  switch (prof) {
    case 'untrained':
      return untrainedImprovisation ? Math.floor(level / 2) : 0;
    case 'trained':
      return level + 2;
    case 'expert':
      return level + 4;
    case 'master':
      return level + 6;
    case 'legendary':
      return level + 8;
  }
}

function SkillRow({
  rec,
  abilityMod,
  level,
  untrainedImprovisation,
}: {
  rec: StoredRecord<KingdomSkill>;
  abilityMod: number | null;
  level: number | null;
  untrainedImprovisation: boolean;
}) {
  const qc = useQueryClient();
  const { draft, setDraft, dirty, baseVersion, bumpBaseVersion } = useDraft(rec.data, rec.version);
  const mutate = usePatch<KingdomSkill>('skills', rec.id);
  const [conflict, setConflict] = useState<StoredRecord<KingdomSkill> | null>(null);
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

  // From the draft so the bonus updates as soon as the dropdown changes.
  const profBonus = profBonusFor(level, draft.proficiency, untrainedImprovisation);

  const up = <K extends keyof KingdomSkill>(key: K, value: KingdomSkill[K]) =>
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

  return (
    <>
      <tr className="border-b border-zinc-200 last:border-0 dark:border-zinc-800">
        <td className="py-2 pr-3 font-medium">{draft.name}</td>
        <td className="py-2 pr-3 capitalize text-zinc-500 dark:text-zinc-400">{draft.ability}</td>
        <td className="py-2 pr-3 text-center tabular-nums">{abilityMod === null ? '' : abilityMod}</td>
        <td className="py-2 pr-3">
          <div className="flex items-center gap-2">
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
            {profBonus !== null && (
              <span className="text-sm tabular-nums text-zinc-600 dark:text-zinc-300" title="Proficiency bonus">
                +{profBonus}
              </span>
            )}
          </div>
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
        <td className="px-3 py-2 text-right">
          {saveError && (
            <span className="text-xs text-red-600 dark:text-red-400" title={saveError}>
              Save failed
            </span>
          )}
        </td>
      </tr>
      <ConflictDialog
        open={conflict !== null}
        title={`${draft.name} skill`}
        current={conflict}
        onAcceptServer={() => {
          if (conflict) {
            qc.setQueryData<StoredRecord<KingdomSkill>[]>(['skills'], (list) =>
              list ? list.map((r) => (r.id === conflict.id ? conflict : r)) : list,
            );
            setDraft(conflict.data);
            setConflict(null);
            setSaveError(null);
          }
        }}
        onForce={forceSave}
      />
    </>
  );
}

export function SkillsPage() {
  const { data, isLoading, error, isFetching, refetch } = useList<KingdomSkill>('skills');
  useAutoRefetchOnError(error, isFetching, refetch);
  const { data: kingdom } = useKingdom();
  if (isLoading) return <p className="text-sm text-zinc-500">Loading skills…</p>;
  if (error || !data) {
    return (
      <div className="card mx-auto max-w-md text-center">
        <p className="mb-3 text-sm text-red-600 dark:text-red-400">Could not load skills.</p>
        <button className="btn-primary" onClick={() => refetch()}>
          Retry
        </button>
      </div>
    );
  }
  const rows = [...data].sort((a, b) => a.data.name.localeCompare(b.data.name));
  const level = kingdom?.data.level ?? null;
  const untrainedImprovisation = kingdom?.data.untrainedImprovisation ?? false;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Kingdom Skills</h1>
      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              <th className="px-4 py-2">Skill</th>
              <th className="px-3 py-2">Ability</th>
              <th className="px-3 py-2 text-center" title="Modifier of the linked kingdom ability (from the Kingdom page)">
                Mod
              </th>
              <th className="px-3 py-2">Proficiency</th>
              <th className="px-3 py-2">Total</th>
              <th className="px-3 py-2">Breakdown</th>
              <th className="px-3 py-2">Notes</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((rec) => (
              <SkillRow
                key={rec.id}
                rec={rec}
                abilityMod={kingdom?.data.abilities[rec.data.ability]?.modifier ?? null}
                level={level}
                untrainedImprovisation={untrainedImprovisation}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
